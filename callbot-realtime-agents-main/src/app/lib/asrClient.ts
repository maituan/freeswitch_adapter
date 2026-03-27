import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { EventEmitter } from 'events';

function ts(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

const PROTO_PATH = path.join(process.cwd(), 'src/app/lib/protos/streaming_voice.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const streamingVoice = protoDescriptor.streaming_voice;

// Interface cho kết quả trả về
export interface ASRResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export class AsrClient extends EventEmitter {
  private client: any;
  private call: any;
  private isConnected: boolean = false;

  constructor(uri: string = process.env.ASR_GRPC_URI || '103.253.20.28:9000') {
    super();
    this.client = new streamingVoice.StreamVoice(
      uri,
      grpc.credentials.createInsecure()
    );
  }

  public startStream(overrides: { speechTimeout?: string; silenceTimeout?: string; speechMax?: string } = {}): boolean {
    if (this.isConnected) {
      this.stopStream();
    }

    const metadata = new grpc.Metadata();
    const token = process.env.ASR_TOKEN || '';
    if (!token) {
      const err = new Error('ASR_TOKEN is missing. Set ASR_TOKEN in environment to connect.');
      this.emit('error', err);
      return false;
    }

    metadata.add('channels', process.env.ASR_CHANNELS || '1');
    metadata.add('rate', process.env.ASR_RATE || '8000');
    metadata.add('format', process.env.ASR_FORMAT || 'S16LE');
    metadata.add('single-sentence', process.env.ASR_SINGLE_SENTENCE || 'False');
    metadata.add('token', token);
    metadata.add('id', process.env.ASR_CLIENT_ID || `client_${Date.now()}`);
    metadata.add('silence_timeout', overrides.silenceTimeout ?? process.env.ASR_SILENCE_TIMEOUT ?? '10');
    metadata.add('speech_timeout', overrides.speechTimeout ?? process.env.ASR_SPEECH_TIMEOUT ?? '1');
    metadata.add('speech_max', overrides.speechMax ?? process.env.ASR_SPEECH_MAX ?? '30');

    this.call = this.client.SendVoice(metadata);
    this.isConnected = true;

    this.call.on('data', (response: any) => {
      // Xử lý response từ server ASR
      if (response.status === 0 && response.result && response.result.hypotheses.length > 0) {
        const hypothesis = response.result.hypotheses[0];
        const result: ASRResult = {
          transcript: hypothesis.transcript,
          isFinal: response.result.final,
          confidence: hypothesis.confidence,
        };
        this.emit('data', result);
        
        if (response.result.final) {
            console.log(`${ts()} [ASR Client] Final: ${hypothesis.transcript}`);
        }
      } else if (response.status !== 0) {
          console.error(`${ts()} [ASR Client] Error status: ${response.status}, msg: ${response.msg}`);
          this.emit('error', new Error(response.msg));
      }
    });

    this.call.on('end', () => {
      console.log(`${ts()} [ASR Client] Stream ended`);
      this.isConnected = false;
      this.emit('end');
    });

    this.call.on('error', (error: Error) => {
      console.error(`${ts()} [ASR Client] Stream error:`, error);
      this.isConnected = false;
      this.emit('error', error);
    });

    return true;
  }

  public sendAudio(chunk: Buffer) {
    if (this.isConnected && this.call) {
      this.call.write({ byte_buff: chunk });
    }
  }

  public stopStream() {
    if (this.isConnected && this.call) {
      this.call.end();
      this.isConnected = false;
      this.call = null;
    }
  }
}

