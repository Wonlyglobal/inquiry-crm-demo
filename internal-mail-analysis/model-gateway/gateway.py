import socket
import threading

LISTEN = ("0.0.0.0", 11434)
TARGET = ("wonly-video-vision", 11434)


def pipe(left, right):
    try:
        while True:
            data = left.recv(65536)
            if not data:
                break
            right.sendall(data)
    except OSError:
        pass
    finally:
        for item in (left, right):
            try:
                item.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


def handle(client):
    try:
        client.settimeout(5)
        header = b""
        while b"\r\n\r\n" not in header and len(header) < 8192:
            chunk = client.recv(2048)
            if not chunk:
                return
            header += chunk
        head, remainder = header.split(b"\r\n\r\n", 1)
        request_line = head.split(b"\r\n", 1)[0].decode("ascii", "strict").split()
        if len(request_line) != 3 or request_line[0] != "POST" or request_line[1] != "/api/chat" or request_line[2] not in ("HTTP/1.0", "HTTP/1.1"):
            client.sendall(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
            return
        headers = {}
        for line in head.split(b"\r\n")[1:]:
            if b":" in line:
                name, value = line.split(b":", 1)
                headers[name.strip().lower()] = value.strip().lower()
        length = int(headers.get(b"content-length", b"0"))
        if headers.get(b"content-type", b"").split(b";", 1)[0] != b"application/json" or length < 2 or length > 1_000_000 or b"transfer-encoding" in headers:
            client.sendall(b"HTTP/1.1 413 Payload Too Large\r\nConnection: close\r\n\r\n")
            return
        upstream = socket.create_connection(TARGET, timeout=10)
        upstream.sendall(head + b"\r\n\r\n" + remainder)
        client.settimeout(None)
        upstream.settimeout(None)
        threading.Thread(target=pipe, args=(client, upstream), daemon=True).start()
        pipe(upstream, client)
    except OSError:
        pass
    finally:
        client.close()


server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(LISTEN)
server.listen(8)
while True:
    client, _ = server.accept()
    threading.Thread(target=handle, args=(client,), daemon=True).start()
