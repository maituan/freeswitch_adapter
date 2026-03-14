export const config = {
  bridgeUrl: process.env.BRIDGE_URL || 'http://localhost:8084',
  databaseUrl: process.env.DATABASE_URL || '',
  kafkaBrokers: (process.env.KAFKA_BROKERS || '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean),
  kafkaClientId: process.env.KAFKA_CLIENT_ID || 'callbot-console',
  kafkaHistoryTopic: process.env.KAFKA_CALL_HISTORY_TOPIC || 'call_history',
}

export default config

