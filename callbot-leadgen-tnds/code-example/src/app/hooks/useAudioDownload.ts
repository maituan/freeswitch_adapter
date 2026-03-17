import { useRef } from "react";
import { convertWebMBlobToWav } from "../lib/audioUtils";

interface AudioDownloadOptions {
  // Getter function để lấy TTS MediaStream (có thể thay đổi theo thời gian)
  getTTSStream?: () => MediaStream | null;
}

function useAudioDownload(options: AudioDownloadOptions = {}) {
  // Ref to store the MediaRecorder instance.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Ref to collect all recorded Blob chunks.
  const recordedChunksRef = useRef<Blob[]>([]);
  // Ref to store AudioContext for cleanup
  const audioContextRef = useRef<AudioContext | null>(null);
  // Ref for TTS stream source node
  const ttsSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  /**
   * Starts recording by combining microphone audio with TTS audio.
   * @param remoteStream - Optional remote MediaStream (e.g., from OpenAI Realtime, if any).
   */
  const startRecording = async (remoteStream?: MediaStream) => {
    // Clear previous recordings
    recordedChunksRef.current = [];
    
    let micStream: MediaStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Error getting microphone stream:", err);
      // Fallback to an empty MediaStream if microphone access fails.
      micStream = new MediaStream();
    }

    // Create an AudioContext to merge the streams.
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const destination = audioContext.createMediaStreamDestination();

    // Connect the microphone audio stream.
    try {
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);
      console.log("[AudioDownload] Microphone stream connected");
    } catch (err) {
      console.error("Error connecting microphone stream to the audio context:", err);
    }

    // Connect the remote audio stream (if provided, e.g., from OpenAI Realtime).
    if (remoteStream && remoteStream.getAudioTracks().length > 0) {
      try {
        const remoteSource = audioContext.createMediaStreamSource(remoteStream);
        remoteSource.connect(destination);
        console.log("[AudioDownload] Remote stream connected");
      } catch (err) {
        console.error("Error connecting remote stream to the audio context:", err);
      }
    }

    // Connect TTS stream (from useTTS hook)
    const connectTTSStream = () => {
      const ttsStream = options.getTTSStream?.();
      if (ttsStream && ttsStream.getAudioTracks().length > 0) {
        try {
          // Disconnect previous TTS source if exists
          if (ttsSourceRef.current) {
            try {
              ttsSourceRef.current.disconnect();
            } catch {
              // Ignore disconnect errors
            }
          }
          const ttsSource = audioContext.createMediaStreamSource(ttsStream);
          ttsSource.connect(destination);
          ttsSourceRef.current = ttsSource;
          console.log("[AudioDownload] TTS stream connected");
        } catch (err) {
          console.error("Error connecting TTS stream to the audio context:", err);
        }
      }
    };

    // Initial TTS stream connection
    connectTTSStream();

    // Periodically check and reconnect TTS stream (in case it changes during recording)
    const ttsCheckInterval = setInterval(() => {
      if (mediaRecorderRef.current?.state === "recording") {
        connectTTSStream();
      } else {
        clearInterval(ttsCheckInterval);
      }
    }, 1000);

    const mimeOptions = { mimeType: "audio/webm" };
    try {
      const mediaRecorder = new MediaRecorder(destination.stream, mimeOptions);
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        clearInterval(ttsCheckInterval);
      };
      // Start recording with timeslice to get frequent data
      mediaRecorder.start(1000); // Get data every second
      mediaRecorderRef.current = mediaRecorder;
      console.log("[AudioDownload] Recording started");
    } catch (err) {
      console.error("Error starting MediaRecorder with combined stream:", err);
      clearInterval(ttsCheckInterval);
    }
  };

  /**
   * Stops the MediaRecorder, if active.
   */
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      // Request any final data before stopping.
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    // Cleanup TTS source
    if (ttsSourceRef.current) {
      try {
        ttsSourceRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      ttsSourceRef.current = null;
    }
    
    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    console.log("[AudioDownload] Recording stopped");
  };

  /**
   * Initiates download of the recording after converting from WebM to WAV.
   * If the recorder is still active, we request its latest data before downloading.
   */
  const downloadRecording = async () => {
    // If recording is still active, request the latest chunk.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      // Request the current data.
      mediaRecorderRef.current.requestData();
      // Allow a short delay for ondataavailable to fire.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (recordedChunksRef.current.length === 0) {
      console.warn("No recorded chunks found to download.");
      return;
    }
    
    // Combine the recorded chunks into a single WebM blob.
    const webmBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });

    try {
      // Convert the WebM blob into a WAV blob.
      const wavBlob = await convertWebMBlobToWav(webmBlob);
      const url = URL.createObjectURL(wavBlob);

      // Generate a formatted datetime string (replace characters not allowed in filenames).
      const now = new Date().toISOString().replace(/[:.]/g, "-");

      // Create an invisible anchor element and trigger the download.
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `realtime_agents_audio_${now}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up the blob URL after a short delay.
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error("Error converting recording to WAV:", err);
    }
  };

  return { startRecording, stopRecording, downloadRecording };
}

export default useAudioDownload; 