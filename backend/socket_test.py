import sys
sys.path.insert(0, 'backend')
import server, httpx, asyncio
async def main():
    async with httpx.AsyncClient(app=server.app, base_url='http://testserver') as client:
        r = await client.get('/socket.io/', params={'EIO': '4', 'transport': 'polling'})
        print(r.status_code, r.headers.get('content-type'), r.text[:200])
asyncio.run(main())
