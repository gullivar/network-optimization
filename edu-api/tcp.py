import os
import subprocess
from functools import lru_cache

from operating_system import get_os_platform_name


@lru_cache(maxsize=1)
def get_tcp_congestion_control() -> str:
    """시스템의 TCP 혼잡 제어 알고리즘 조회 (캐시됨)"""
    # 환경 변수 우선 (테스트/오버라이드용)
    if env_value := os.getenv("TCP_CONGESTION_CONTROL"):
        return env_value

    system = get_os_platform_name()

    try:
        if system == "Linux":
            # Linux: net.ipv4.tcp_congestion_control
            result = subprocess.run(
                ["sysctl", "-n", "net.ipv4.tcp_congestion_control"],
                capture_output=True,
                text=True,
                timeout=1,
            )
            return result.stdout.strip() if result.returncode == 0 else "unavailable"

        elif system == "Darwin":  # macOS
            # macOS: net.inet.tcp.use_newreno (0=cubic, 1=newreno)
            result = subprocess.run(
                ["sysctl", "-n", "net.inet.tcp.use_newreno"],
                capture_output=True,
                text=True,
                timeout=1,
            )
            if result.returncode == 0:
                use_newreno = result.stdout.strip()
                return "newreno" if use_newreno == "1" else "cubic"
            return "unavailable"

        else:
            return f"unsupported-os-{system.lower()}"

    except Exception as e:
        return f"error: {str(e)}"


@lru_cache(maxsize=1)
def get_tcp_qdisc() -> str:
    """기본 qdisc/queue discipline 조회 (캐시됨)"""
    # 환경 변수 우선 (테스트/오버라이드용)
    if env_value := os.getenv("TCP_QDISC"):
        return env_value

    system = get_os_platform_name()

    try:
        if system == "Linux":
            # Linux: net.core.default_qdisc
            result = subprocess.run(
                ["sysctl", "-n", "net.core.default_qdisc"],
                capture_output=True,
                text=True,
                timeout=1,
            )
            return result.stdout.strip() if result.returncode == 0 else "unavailable"

        elif system == "Darwin":  # macOS
            # macOS uses FQ-CoDel (Fair Queuing with Controlled Delay)
            # Verify it's enabled by checking net.classq.fq_codel.enable_pacing
            result = subprocess.run(
                ["sysctl", "-n", "net.classq.fq_codel.enable_pacing"],
                capture_output=True,
                text=True,
                timeout=1,
            )
            if result.returncode == 0:
                enabled = result.stdout.strip()
                return "fq_codel" if enabled == "1" else "fq_codel(disabled)"
            return "fq_codel"  # Default assumption for macOS

        else:
            return f"unsupported-os-{system.lower()}"

    except Exception:
        return "unavailable"
