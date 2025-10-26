// To run this test with the proxy specified in proxy.pac, set the K6_HTTP_PROXY environment variable.
// For example:
// HTTP_PROXY="http://127.0.0.1:80" k6 run mock-api-test.js
// http://192.168.68.88:8000/api/v1/mock/file
// http://192.168.68.88:8000/api/v1/mock/item

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 500, // 500 virtual users
  iterations: 10000, // 500 users * 20 requests = 10000 total iterations
  duration: '10m', // complete within 10 minutes
};

export default function () {
  const res = http.get('http://192.168.68.88:8000/api/v1/mock/item');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  
  sleep(1);
}
