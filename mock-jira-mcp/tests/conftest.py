from __future__ import annotations

import socket
import threading
import time

import httpx
import pytest
import uvicorn


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Served:
    def __init__(self, app, path_probe: str = "/") -> None:
        self.port = free_port()
        self.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=self.port, log_level="warning"))
        self.thread = threading.Thread(target=self.server.run, daemon=True)
        self.thread.start()
        for _ in range(100):
            try:
                httpx.get(f"http://127.0.0.1:{self.port}{path_probe}", timeout=0.5)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.05)

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def stop(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=5)


@pytest.fixture
def serve():
    started: list[Served] = []

    def _start(app, path_probe: str = "/") -> Served:
        s = Served(app, path_probe)
        started.append(s)
        return s

    yield _start
    for s in started:
        s.stop()
