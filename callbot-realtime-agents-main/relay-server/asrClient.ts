import WebSocket from 'ws'

type TranscriptCallback = (transcript: string, isFinal: boolean) => void

export class AsrClient {
  private ws: WebSocket | null = null
  private cb: TranscriptCallback = () => {}

  constructor(private url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url)
      this.ws.on('open', () => {
        this.ws!.send(JSON.stringify({ type: 'start' }))
        resolve()
      })
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'transcript') {
            this.cb(msg.data.transcript, msg.data.isFinal)
          }
        } catch {}
      })
      this.ws.on('error', reject)
    })
  }

  sendAudio(buffer: Buffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buffer)
    }
  }

  onTranscript(cb: TranscriptCallback) {
    this.cb = cb
  }

  close() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop' }))
    }
    this.ws?.close()
    this.ws = null
  }
}
