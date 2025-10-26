function FindProxyForURL(url, host) {
    if (shExpMatch(url, "https://192.168.68.88:8000/*")) {
        return "PROXY 127.0.0.1:443";
    }

    return "DIRECT";
}
