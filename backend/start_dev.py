#!/usr/bin/env python
import os
import uvicorn
from server import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    host = os.environ.get("HOST", "192.168.29.101")
    uvicorn.run(app, host=host, port=port, reload=False)
