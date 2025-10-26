from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, ORJSONResponse

from tcp import get_tcp_congestion_control, get_tcp_qdisc

app = FastAPI()

# Custom headers that need to be exposed for CORS
EXPOSED_HEADERS = ["X-TCP-Congestion-Control", "X-TCP-Qdisc", "X-Server"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=EXPOSED_HEADERS,
)


@app.middleware("http")
async def add_tcp_info_headers(request: Request, call_next):
    """모든 응답에 TCP 정보 헤더 추가"""
    response = await call_next(request)

    # TCP 정보 헤더 추가 (캐시된 값 사용)
    response.headers["X-TCP-Congestion-Control"] = get_tcp_congestion_control()
    response.headers["X-TCP-Qdisc"] = get_tcp_qdisc()

    return response


@app.get("/api/v1/mock/file")
async def download_mock_data() -> FileResponse:
    return FileResponse(
        "file/dummy.mp4", media_type="application/octet-stream", filename="dummy.mp4"
    )


@app.get("/api/v1/mock/item")
async def get_server_info() -> ORJSONResponse:
    return ORJSONResponse(
        {
            "status": {
                "code": 200,
                "message": "success",
                "timestamp": "2025-10-19T15:00:00Z",
                "requestId": "req_abc123xyz789",
            },
            "data": [
                {
                    "id": "item_001",
                    "title": "Sample Item 1",
                    "description": "Description of item 1",
                    "createdAt": "2025-10-19T14:30:00Z",
                    "updatedAt": "2025-10-19T14:30:00Z",
                    "status": "active",
                },
                {
                    "id": "item_002",
                    "title": "Sample Item 2",
                    "description": "Description of item 2",
                    "createdAt": "2025-10-19T14:25:00Z",
                    "updatedAt": "2025-10-19T14:25:00Z",
                    "status": "active",
                },
            ],
            "pagination": {
                "offset": 0,
                "limit": 20,
                "pageNumber": 1,
                "pageSize": 20,
                "totalCount": 150,
                "totalPages": 8,
                "hasNextPage": True,
                "hasPreviousPage": False,
                "nextPageNumber": 2,
                "previousPageNumber": None,
            },
            "cursor": {
                "current": "cursor_eyJpZCI6ICJpdGVtXzAwMiIsICJjcmVhdGVkQXQiOiAiMjAyNS0xMC0xOVQxNDoyNTowMFoifQ==",
                "next": "cursor_eyJpZCI6ICJpdGVtXzAyMSIsICJjcmVhdGVkQXQiOiAiMjAyNS0xMC0xOVQxMzo1MDowMFoifQ==",
                "previous": None,
            },
            "sorting": {
                "orderBy": "createdAt",
                "order": "desc",
                "availableSortFields": [
                    "id",
                    "title",
                    "createdAt",
                    "updatedAt",
                    "status",
                ],
            },
            "filtering": {
                "appliedFilters": {
                    "status": ["active"],
                    "dateRange": {"startDate": "2025-10-01", "endDate": "2025-10-19"},
                },
                "availableFilters": {
                    "status": {
                        "type": "enum",
                        "values": ["active", "inactive", "archived"],
                    },
                    "dateRange": {
                        "type": "dateRange",
                        "min": "2025-01-01",
                        "max": "2025-10-19",
                    },
                },
            },
            "links": {
                "self": "https://api.example.com/v1/items?page=1&limit=20&sort=createdAt&order=desc",
                "first": "https://api.example.com/v1/items?page=1&limit=20",
                "last": "https://api.example.com/v1/items?page=8&limit=20",
                "next": "https://api.example.com/v1/items?page=2&limit=20",
                "previous": None,
            },
            "meta": {
                "version": "1.0",
                "performanceMetrics": {"queryExecutionTime": 125, "responseTime": 145},
                "caching": {
                    "isCached": False,
                    "cacheKey": "items:page:1:limit:20:sort:createdAt:asc",
                    "ttl": 300,
                },
            },
            "errors": None,
        },
        status_code=status.HTTP_200_OK,
    )
