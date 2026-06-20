import asyncio
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
BASE="https://www.swfldatagulf.com"
PAGES=["/ask","/demo","/data-intel","/showcase"]
async def main():
    b=BrowserConfig(headless=True,verbose=False)
    r=CrawlerRunConfig(cache_mode=CacheMode.BYPASS,page_timeout=30000,wait_until="networkidle",scan_full_page=True)
    async with AsyncWebCrawler(config=b) as c:
        for p in PAGES:
            res=await c.arun(url=BASE+p,config=r)
            md=(res.markdown.raw_markdown if res.markdown else "")[:900].replace("\n\n","\n")
            print(f"\n===== {p}  (md_len={len(res.markdown.raw_markdown) if res.markdown else 0}) =====")
            print(md)
asyncio.run(main())
