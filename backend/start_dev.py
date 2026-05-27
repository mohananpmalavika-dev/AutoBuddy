#!/usr/bin/env python
import os
import uvicorn
from server import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, reload=False)
