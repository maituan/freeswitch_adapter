import { Kafka, logLevel } from 'kafkajs'
import pg from 'pg'

const { Pool } = pg

async function main() {
  const brokerStr = process.env.KAFKA_BROKERS || ''
  const brokers = brokerStr.split(',').map((b) => b.trim()).filter(Boolean)
  if (!brokers.length) {
    console.error('KAFKA_BROKERS not set, consumer disabled')
    process.exit(0)
  }
  const topic = process.env.KAFKA_CALL_HISTORY_TOPIC || 'call_history'
  const clientId = process.env.KAFKA_CLIENT_ID || 'callbot-console'
  const databaseUrl = process.env.DATABASE_URL || ''
  if (!databaseUrl) {
    console.error('DATABASE_URL not set, consumer disabled')
    process.exit(0)
  }

  const kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.INFO,
  })

  const admin = kafka.admin()
  await admin.connect()
  try {
    const existing = await admin.listTopics()
    if (!existing.includes(topic)) {
      await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }], validateOnly: false })
      console.log('[KafkaConsumer] Created topic', topic)
    }
  } finally {
    await admin.disconnect()
  }

  const consumer = kafka.consumer({ groupId: `${clientId}-history` })
  await consumer.connect()
  await consumer.subscribe({ topic, fromBeginning: false })
  console.log('[KafkaConsumer] Listening on topic', topic)

  const pool = new Pool({ connectionString: databaseUrl })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const key = message.key?.toString() || ''
        const value = message.value?.toString() || ''
        if (!value) return
        const payload = JSON.parse(value)

        const {
          call_id,
          scenario,
          phone,
          lead_id,
          gender,
          name,
          plate,
          start_time,
          end_time,
          history,
        } = payload

        if (!call_id || !phone || !start_time || !end_time) {
          console.warn('[KafkaConsumer] skip invalid payload key=', key)
          return
        }

        await pool.query(
          `INSERT INTO call_history (
            call_id, scenario, phone, lead_id, gender, name, plate,
            start_time, end_time, status, history
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (call_id) DO UPDATE SET
            scenario = EXCLUDED.scenario,
            phone = EXCLUDED.phone,
            lead_id = EXCLUDED.lead_id,
            gender = EXCLUDED.gender,
            name = EXCLUDED.name,
            plate = EXCLUDED.plate,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            status = EXCLUDED.status,
            history = EXCLUDED.history`,
          [
            call_id,
            scenario,
            phone,
            lead_id ?? null,
            gender ?? null,
            name ?? null,
            plate ?? null,
            start_time,
            end_time,
            'ended',
            JSON.stringify(history || []),
          ],
        )

        console.log('[KafkaConsumer] stored call history', { call_id, topic, partition })
      } catch (err) {
        console.error('[KafkaConsumer] error processing message', err)
      }
    },
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
