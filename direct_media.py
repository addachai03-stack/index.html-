"""Public direct video HTTP download, with TLS verification and IP pinning."""
import http.client,ipaddress,socket,ssl,time
from urllib.parse import urlsplit,urljoin
MAX_BYTES=650*1024*1024
def media_kind(header):
    if len(header)>=12 and header[4:8] in (b"ftyp",b"moov",b"mdat",b"wide",b"free"): return ".mp4"
    if header.startswith(b"\x1a\x45\xdf\xa3"): return ".webm"
    raise ValueError("Expected MP4/MOV/WebM/Matroska media, not a webpage or playlist.")
def endpoint(url):
    p=urlsplit(url)
    if any(ord(c)<33 or ord(c)==127 for c in url) or "\\" in url or len(url)>4096 or p.scheme!="https" or not p.hostname or p.username is not None or p.password is not None or p.port is not None or p.fragment:
        raise ValueError("Unsafe direct media endpoint.")
    ips=list(dict.fromkeys(x[4][0] for x in socket.getaddrinfo(p.hostname,443,type=socket.SOCK_STREAM)))
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips): raise ValueError("Non-public IP blocked.")
    return p,ips
class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self,host,ip):
        super().__init__(host,port=443,timeout=25,context=ssl.create_default_context())
        self.ip=ip
    def connect(self):
        raw=socket.create_connection((self.ip,443),timeout=self.timeout)
        try: self.sock=self._context.wrap_socket(raw,server_hostname=self.host)
        except Exception:
            raw.close()
            raise
def download_direct(url,work,max_bytes=MAX_BYTES):
    if not isinstance(max_bytes,int) or max_bytes<4096 or max_bytes>MAX_BYTES: raise ValueError("Invalid media size cap")
    current=url;target=work/"direct-download.part";deadline=time.monotonic()+300
    try:
        for _ in range(6):
            p,ips=endpoint(current)
            if time.monotonic()>deadline: raise TimeoutError("Download timeout")
            response=None
            for ip in ips:
                conn=PinnedHTTPS(p.hostname,ip)
                try:
                    conn.request("GET",(p.path or "/")+("?" + p.query if p.query else ""),headers={"Accept":"video/*,application/octet-stream","User-Agent":"CutNova/2.5","Accept-Encoding":"identity"})
                    response=conn.getresponse();break
                except (OSError,http.client.HTTPException): conn.close()
            if response is None: raise RuntimeError("Verified HTTPS connection failed")
            try:
                if response.status in (301,302,303,307,308):
                    location=response.getheader("Location")
                    if not location: raise ValueError("Redirect lacks destination")
                    current=urljoin(current,location);continue
                if response.status!=200: raise RuntimeError(f"Direct media unavailable (HTTP {response.status})")
                size=response.getheader("Content-Length")
                if size and (not size.isdecimal() or int(size)>max_bytes): raise ValueError("File exceeds size limit")
                with target.open("wb") as f:
                    header=response.read(32);ext=media_kind(header);f.write(header);total=len(header)
                    while True:
                        if time.monotonic()>deadline: raise TimeoutError("Download timeout")
                        data=response.read(262144)
                        if not data: break
                        total+=len(data)
                        if total>max_bytes: raise ValueError("File exceeds size limit")
                        f.write(data)
                if total<4096: raise ValueError("Media too small")
                final=work/("source"+ext);target.replace(final);return final
            finally: response.close();conn.close()
        raise ValueError("Too many redirects")
    finally: target.unlink(missing_ok=True)
