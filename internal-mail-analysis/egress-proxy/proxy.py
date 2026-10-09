import select
import socket
import threading

LISTEN = ("0.0.0.0", 3128)
ALLOWED = "plhverjihjilnuhlhlxi.supabase.co"


def relay(client, upstream):
    peers = [client, upstream]
    try:
        while True:
            readable, _, exceptional = select.select(peers, [], peers, 60)
            if exceptional or not readable:
                return
            for source in readable:
                payload = source.recv(65536)
                if not payload:
                    return
                target = upstream if source is client else client
                target.sendall(payload)
    except OSError:
        return
    finally:
        for peer in peers:
            try:
                peer.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            peer.close()


def handle(client):
    try:
        client.settimeout(5)
        header = b""
        while b"\r\n\r\n" not in header and len(header) < 4096:
            chunk = client.recv(1024)
            if not chunk:
                return
            header += chunk
        first = header.split(b"\r\n", 1)[0].decode("ascii", "strict").split()
        if len(first) != 3 or first[0] != "CONNECT" or first[1] != ALLOWED + ":443":
            client.sendall(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
            return
        upstream = socket.create_connection((ALLOWED, 443), timeout=10)
        client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        client.settimeout(None)
        upstream.settimeout(None)
        relay(client, upstream)
    except (OSError, UnicodeError, ValueError):
        try:
            client.sendall(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n")
        except OSError:
            pass
    finally:
        client.close()


server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(LISTEN)
server.listen(32)
while True:
    client, _ = server.accept()
    threading.Thread(target=handle, args=(client,), daemon=True).start()
