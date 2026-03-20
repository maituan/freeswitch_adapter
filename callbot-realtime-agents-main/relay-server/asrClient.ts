import WebSocket from 'ws'

type TranscriptCallback = (transcript: string, isFinal: boolean) => void

export interface AsrParams {
  speechTimeout?: string
  silenceTimeout?: string
  speechMax?: string
}

export class AsrClient {
  private ws: WebSocket | null = null
  private cb: TranscriptCallback = () => {}

  constructor(private url: string) {}

  connect(params: AsrParams = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url)
      this.ws.on('open', () => {
        const startMsg: Record<string, any> = { type: 'start' }
        if (params.speechTimeout !== undefined) startMsg['speechTimeout'] = params.speechTimeout
        if (params.silenceTimeout !== undefined) startMsg['silenceTimeout'] = params.silenceTimeout
        if (params.speechMax !== undefined) startMsg['speechMax'] = params.speechMax
        this.ws!.send(JSON.stringify(startMsg))
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

  /** Stop current gRPC stream and start a fresh one, discarding any buffered audio. */
  restartStream(params: AsrParams = {}): Promise<void> {
    this.close()
    return this.connect(params)
  }

  close() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop' }))
    }
    this.ws?.close()
    this.ws = null
  }
}
