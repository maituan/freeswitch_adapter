import asyncio
import websockets
import json
import base64
import os
import time
import numpy as np
import sounddevice as sd

# Voice settings
XI_API_KEY = 'ws_3f9e7cba-d8e4-4b6a-9c73-9c9f5e2c8d21'
VOICE_ID = "thuduyen-south"

START_TIME = time.time()
TTS_START_TIME = time.time()

async def text_chunker(chunks):
	"""Split text into chunks, ensuring to not break sentences."""
	splitters = (".", ",", "?", "!", ";", ":", "—", "-", "(", ")", "[", "]", "}", " ")
	buffer = ""

	async for text in chunks:
		if text is None:
			continue
		if buffer.endswith(splitters):
			yield buffer + " "
			buffer = text
		elif text.startswith(splitters):
			yield buffer + text[0] + " "
			buffer = text[1:]
		else:
			buffer += text

	if buffer:
		print("buffer:", buffer)
		yield buffer + " "


async def stream(audio_stream):
	"""Stream audio data using sounddevice."""
	# Cấu hình audio stream
	sample_rate = 8000
	channels = 1
	dtype = np.int16
	
	# Tạo output stream
	stream = sd.OutputStream(
		samplerate=sample_rate,
		channels=channels,
		dtype=dtype
	)
	stream.start()
	
	print("Audio stream started with configuration:", {
		"sample_rate": sample_rate,
		"channels": channels,
		"dtype": dtype
	})

	try:
		async for chunk in audio_stream:
			if chunk:
				# Chuyển bytes thành numpy array
				audio_data = np.frombuffer(chunk, dtype=dtype)
				# Phát audio
				stream.write(audio_data)
				print(f"Playing chunk of size: {len(audio_data)}")
	except Exception as e:
		print(f"Error in audio playback: {e}")
	finally:
		stream.stop()
		stream.close()
		print("Audio stream closed")


async def text_to_speech_input_streaming(voice_id, text_iterator):
	"""Send text to TTS API and stream the returned audio."""
	uri = "ws://103.253.20.27:8767"
	print(f"Connecting to TTS server with URI: {uri}")
	
	start_time = time.time()
	
	async with websockets.connect(uri) as websocket:
		print("Connected to websocket, sending initial settings")
		await websocket.send(json.dumps({
			"text": " ",
			"voice_settings": {
				"voiceId": "thanhthao-south-VND",
		"tempo":0.9,
				"resample_rate": 8000,
			},
			"generator_config": {
				"chunk_length_schedule": [20]
			},
			"xi_api_key": XI_API_KEY,
		}))
		print("Sent initial settings to TTS server:", time.time() - start_time)
		async def listen():
			"""Listen to the websocket for audio data and stream it."""
			listen_start_time = time.time()
			print("Started listening to websocket at:", listen_start_time)
			audio_chunks_received = 0
			is_first_chunk = False
			
			while True:
				try:
					message = await websocket.recv()
					if not is_first_chunk:
						print("=======> DONE:", time.time() - START_TIME)
						print("First TTS chunk received:", time.time() - listen_start_time, time.time() - TTS_START_TIME)
						is_first_chunk = True
					
					data = json.loads(message)
					if data.get("audio"):
						audio_chunks_received += 1
						audio_data = base64.b64decode(data["audio"])
						print(f"Received audio chunk #{audio_chunks_received}, size: {len(audio_data)} bytes")
						yield audio_data
					elif data.get('isFinal'):
						print(f"Finished receiving audio. Total chunks: {audio_chunks_received}")
						break
					elif data.get('error'):
						print(f"Error from TTS server: {data.get('error')}")
						break
				except websockets.exceptions.ConnectionClosed:
					print("Websocket connection closed unexpectedly")
					break
				except Exception as e:
					print(f"Error while processing audio: {e}")
					break
		TTS_START_TIME = time.time()
		listen_task = asyncio.create_task(stream(listen()))
		chunk_start_time = time.time()
		
		print("Process chunking:", chunk_start_time)
		flag = False
		async for text in text_chunker(text_iterator):
			if not flag:
				print("First chunk:", time.time(), time.time() - chunk_start_time)
				flag = True
			print("chunk:", text)
			await websocket.send(json.dumps({"text": text}))

		await websocket.send(json.dumps({"text": ""}))
		await listen_task


async def text_to_speech(text):
	"""Convert text to speech using TTS API."""
	print(f"Starting text-to-speech conversion: {time.time()}")
	
	async def text_iterator():
		"""Generate text chunks from input text."""
		for chunk in text:
			yield chunk
	
	await text_to_speech_input_streaming(VOICE_ID, text_iterator())


# Main execution
if __name__ == "__main__":
	START_TIME = time.time()
	print("STARTING")

	#text = "Nhiều năm trước, khi phụ trách chương trình đào tạo biên phiên dịch và ngôn ngữ ở một trường đại học tại Việt Nam, tôi nhận ra không ít giảng viên có học vị cao, nắm vững lý thuyết nhưng ít tiếp xúc với công việc thực tế."
	text = "1123900 anh ạ"
	#text = 'à dạ vâng Chị yên tâm, giấy tờ là của Bộ Tài Chính in, trên giấy vẫn ghi đủ bốn trăm tám mươi ngàn bảy trăm đồng. Giá hai trăm chín mươi ngàn là do bên em cắt quỹ Marketing để tri ân khách quen thôi. Chị có muốn giữ suất này không ạ?'
	asyncio.run(text_to_speech(text))


