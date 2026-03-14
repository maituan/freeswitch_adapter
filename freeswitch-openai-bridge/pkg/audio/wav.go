package audio

import (
	"encoding/binary"
	"os"
)

// WriteWAVHeader writes a 44-byte PCM WAV header to f.
// DataSize is written as 0 — FreeSWITCH handles growing files correctly.
func WriteWAVHeader(f *os.File, sampleRate, channels, bitsPerSample int) error {
	byteRate := sampleRate * channels * bitsPerSample / 8
	blockAlign := channels * bitsPerSample / 8

	buf := make([]byte, 44)

	// RIFF chunk
	copy(buf[0:4], []byte("RIFF"))
	binary.LittleEndian.PutUint32(buf[4:8], 0) // file size - 8; 0 = streaming
	copy(buf[8:12], []byte("WAVE"))

	// fmt sub-chunk
	copy(buf[12:16], []byte("fmt "))
	binary.LittleEndian.PutUint32(buf[16:20], 16)                    // sub-chunk size
	binary.LittleEndian.PutUint16(buf[20:22], 1)                     // PCM
	binary.LittleEndian.PutUint16(buf[22:24], uint16(channels))
	binary.LittleEndian.PutUint32(buf[24:28], uint32(sampleRate))
	binary.LittleEndian.PutUint32(buf[28:32], uint32(byteRate))
	binary.LittleEndian.PutUint16(buf[32:34], uint16(blockAlign))
	binary.LittleEndian.PutUint16(buf[34:36], uint16(bitsPerSample))

	// data sub-chunk
	copy(buf[36:40], []byte("data"))
	binary.LittleEndian.PutUint32(buf[40:44], 0) // data size; 0 = streaming

	_, err := f.Write(buf)
	return err
}
