package audio

import "encoding/binary"

// Upsample8to24 converts 8kHz PCM16 to 24kHz PCM16 using linear interpolation (factor 3).
func Upsample8to24(src []byte) []byte {
	if len(src) < 2 {
		return src
	}

	samples := bytesToInt16(src)
	out := make([]int16, len(samples)*3)

	for i, s := range samples {
		var next int16
		if i+1 < len(samples) {
			next = samples[i+1]
		} else {
			next = s
		}
		out[i*3] = s
		out[i*3+1] = int16(int32(s)*2/3 + int32(next)*1/3)
		out[i*3+2] = int16(int32(s)*1/3 + int32(next)*2/3)
	}

	return int16ToBytes(out)
}

// Downsample24to8 converts 24kHz PCM16 to 8kHz PCM16 by taking every 3rd sample.
func Downsample24to8(src []byte) []byte {
	if len(src) < 2 {
		return src
	}

	samples := bytesToInt16(src)
	outLen := len(samples) / 3
	if outLen == 0 {
		return nil
	}

	out := make([]int16, outLen)
	for i := range out {
		out[i] = samples[i*3]
	}

	return int16ToBytes(out)
}

func bytesToInt16(b []byte) []int16 {
	n := len(b) / 2
	out := make([]int16, n)
	for i := range out {
		out[i] = int16(binary.LittleEndian.Uint16(b[i*2:]))
	}
	return out
}

func int16ToBytes(s []int16) []byte {
	out := make([]byte, len(s)*2)
	for i, v := range s {
		binary.LittleEndian.PutUint16(out[i*2:], uint16(v))
	}
	return out
}
