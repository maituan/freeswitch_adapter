import { Kafka, logLevel, Producer } from 'kafkajs'

export interface CallHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  origin_content: string
  turn_id: number
  timestamp: string
}

export interface CallHistoryPayload {
  call_id: string
  scenario: string
  phone: string
  start_time: string
  end_time: string
  history: CallHistoryMessage[]
  customer_info: Record<string, any>
  report?: Array<{ step: string; detail: string; timestamp: string }>
}

let producer: Producer | null = null
let kafkaInitialized = false

async function getProducer(): Promise<Producer | null> {
  if (producer) return producer

  const brokers = (process.env.KAFKA_BROKERS || '').split(',').map(b => b.trim()).filter(Boolean)
  const topic = process.env.KAFKA_CALL_HISTORY_TOPIC || ''

  if (!brokers.length || !topic) {
    if (!kafkaInitialized) {
      console.log('[Kafka] Call history disabled (missing KAFKA_BROKERS or KAFKA_CALL_HISTORY_TOPIC)')
      kafkaInitialized = true
    }
    return null
  }

  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'callbot-relay',
    brokers,
    logLevel: logLevel.NOTHING,
  })

  producer = kafka.producer()
  await producer.connect()
  kafkaInitialized = true
  console.log('[Kafka] Connected for call history logging')
  return producer
}

export async function sendCallHistory(key: string, payload: CallHistoryPayload): Promise<void> {
  const topic = process.env.KAFKA_CALL_HISTORY_TOPIC || ''
  const p = await getProducer()
  if (!p || !topic) return

  try {
    await p.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(payload),
        },
      ],
    })
    console.log('[Kafka] Call history sent', { topic, key })
  } catch (err) {
    console.error('[Kafka] Failed to send call history:', err)
  }
}

