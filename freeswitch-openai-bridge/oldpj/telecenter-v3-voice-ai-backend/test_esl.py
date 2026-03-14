import socket
import sys

host = '127.0.0.1'
port = 8021

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
try:
    s.connect((host, port))
    # read banner
    data = s.recv(1024)
    print('Banner:', data.decode('utf-8', errors='replace'))
    # send auth
    auth = 'auth ClueCon\n\n'
    s.sendall(auth.encode())
    # read response
    resp = s.recv(1024)
    print('Auth response:', resp.decode('utf-8', errors='replace'))
    # send api status
    cmd = 'api status\n\n'
    s.sendall(cmd.encode())
    resp = s.recv(4096)
    print('API status:', resp.decode('utf-8', errors='replace'))
except Exception as e:
    print('Error:', e)
finally:
    s.close()