# Edu Network PoC (Proof of Concept)

이 프로젝트는 시뮬레이션된 다중 클라이언트 환경에서 캐싱 프록시가 네트워크 성능에 미치는 영향을 시연하고 테스트하기 위한 PoC(Proof of Concept)입니다.

Docker를 사용하여 여러 웹 클라이언트가 캐싱 프록시를 통해 API 서버에서 파일을 다운로드하는 상황을 시뮬레이션하는 네트워크 환경을 구축합니다. 이 프로젝트의 목표는 캐시되지 않은 첫 번째 다운로드와 이후 캐시된 다운로드 간의 성능 차이를 관찰하는 것입니다. 또한, 서버의 TCP 혼잡 제어 알고리즘과 같은 네트워크 스택 구성이 다운로드 성능에 미치는 영향을 분석하는 기능을 포함합니다.

## 아키텍처

이 프로젝트는 다음과 같은 구성 요소로 이루어져 있습니다:

- **`edu-api`**: `/api/v1/mock/file` 엔드포인트에서 더미 비디오 파일(`dummy.mp4`)을 제공하는 간단한 Python FastAPI 애플리케이션입니다. 이 서버가 원본 서버(Origin Server) 역할을 합니다.

  - **네트워크 정보 제공**: 이 API는 응답 헤더에 서버의 TCP 혼잡 제어 알고리즘(`X-TCP-Congestion-Control`)과 큐 관리 방식(`X-TCP-Qdisc`) 정보를 포함하여 클라이언트가 서버의 네트워크 스택 구성을 확인할 수 있도록 합니다. 이는 CUBIC, BBR 등 다양한 TCP 알고리즘에 따른 성능 변화를 테스트하고 분석하는 데 사용될 수 있습니다.

- **`edu-web-tablet`**: 클라이언트 역할을 하는 React 기반 웹 애플리케이션입니다. API로부터 비디오 파일을 5회 연속으로 다운로드하는 UI를 제공합니다. 각 다운로드 시도의 속도, 진행률, 경과 시간 등 상세한 실시간 통계를 표시하여 캐싱 효과를 시각적으로 쉽게 확인할 수 있습니다.

- **`nginx`**: 클라이언트와 API 서버 사이에 위치하여 리버스 프록시 및 캐싱 계층 역할을 하는 Nginx 서버입니다. API 서버의 응답을 캐시하도록 설정되어 있습니다.

- **`proxy-auto-config`**: 프록시 자동 설정(`.pac`) 파일을 포함합니다. 이 파일들은 클라이언트의 웹 브라우저가 API 서버로의 트래픽을 Nginx 프록시를 통해 라우팅하도록 지시합니다.

- **`docker-compose.yaml`**: 전체 환경을 조율하는 메인 파일입니다. 5개의 `edu-web-tablet` 클라이언트 인스턴스, 1개의 `edu-api` 서버 인스턴스, 그리고 `nginx` 프록시를 실행하며, 실제 네트워크 토폴로지를 시뮬레이션하기 위해 이들을 커스텀 Docker 네트워크로 연결합니다.

- **`dnsmasq` (선택적, 로컬 설정)**: WPAD(Web Proxy Auto-Discovery Protocol)를 지원하기 위한 경량 DNS 서버입니다. 로컬 네트워크에서 `wpad` 호스트 이름을 Nginx 프록시 서버의 IP로 해석해주어, 클라이언트가 프록시 설정을 자동으로 감지할 수 있게 합니다. 이 컴포넌트는 Docker 환경에 포함되어 있지 않으며, 필요한 경우 호스트 머신에 직접 설치하여 사용합니다.

## 동작 방식

1.  웹 UI에서 "Start Download" 버튼을 처음 클릭하면, 클라이언트는 API 서버로 요청을 보냅니다.
2.  이 요청은 PAC 파일에 명시된 대로 Nginx 프록시를 통해 라우팅됩니다.
3.  Nginx는 요청을 `edu-api` 서버로 전달하고, `dummy.mp4` 파일을 받아온 후 클라이언트에게 전송하기 전에 캐시에 복사본을 저장합니다. 이 첫 번째 다운로드는 원본 서버에서 직접 파일을 가져오는 속도를 반영합니다.
4.  이후의 모든 다운로드 시도에서, Nginx 프록시는 캐시된 버전의 파일을 찾습니다. `edu-api` 서버에 다시 요청하는 대신, 캐시에서 직접 파일을 제공합니다.
5.  웹 UI는 후속 다운로드가 훨씬 빠르다는 것을 명확하게 보여주어 캐싱 프록시의 효과를 입증합니다.
6.  각 다운로드 응답에는 `edu-api` 서버의 TCP 설정 정보가 헤더에 포함되어 있습니다. 브라우저의 개발자 도구를 사용하여 이 정보를 확인하면, 서버의 네트워크 스택 구성(예: CUBIC vs. BBR)이 다운로드 속도에 미치는 영향을 심층적으로 분석할 수 있습니다.

## 시작하기

### 사전 요구사항

- Docker
- Docker Compose

### 프로젝트 실행 방법

1.  **서비스 빌드 및 실행:**

    ```bash
    docker-compose up --build
    ```

2.  **브라우저 프록시 설정:**

    - 운영체제나 브라우저가 제공된 프록시 자동 설정(PAC) 파일을 사용하도록 설정해야 합니다.
    - PAC 파일 URL: `http://localhost/proxy.pac`
    - _참고: 프록시 PAC 파일을 설정하는 방법은 운영체제 및 브라우저마다 다릅니다. 사용하시는 시스템의 설명서를 참조하십시오._

3.  **웹 애플리케이션 접속:**

    - 웹 브라우저를 열고 다음 클라이언트 인스턴스 중 하나로 이동합니다:
      - `http://localhost:4173`
      - `http://localhost:4174`
      - `http://localhost:4175`
      - `http://localhost:4176`
      - `http://localhost:4177`

4.  **테스트 실행:**

    - `VITE_API_URL`은 Docker 설정에서 프록시가 가로챌 수 있는 올바른 주소(`http://192.168.68.88:8000/api/v1/mock`)로 미리 구성되어 있습니다.
    - **"Start Download"** 버튼을 클릭합니다.
    - 5번의 다운로드 시도에 대한 통계를 관찰합니다. 첫 번째 시도 이후 속도가 눈에 띄게 향상되고 다운로드 시간이 단축되는 것을 확인할 수 있습니다.
    - **(심화)** 브라우저의 개발자 도구(네트워크 탭)를 열어 각 다운로드 요청의 응답 헤더를 확인해 보세요. `X-TCP-Congestion-Control` 및 `X-TCP-Qdisc` 헤더를 통해 서버가 사용 중인 네트워크 설정을 파악할 수 있습니다.

## 고급: TCP 혼잡 제어 알고리즘 변경 (BBR 테스트)

`edu-api` 서버가 실행되는 호스트의 TCP 혼잡 제어 알고리즘을 변경하여 다양한 네트워크 환경에서의 성능을 테스트할 수 있습니다. 예를 들어, Google에서 개발한 BBR 알고리즘을 적용하여 CUBIC(기본값)과 성능을 비교할 수 있습니다.

1.  **BBR 설정 파일 확인:**

    - `tcp-algorithm/sysctl.conf` 파일은 BBR을 활성화하기 위한 설정 예시를 포함하고 있습니다.
      ```
      net.core.default_qdisc=fq
      net.ipv4.tcp_congestion_control=bbr
      ```

2.  **설정 적용 (Linux 호스트):**

    - `edu-api`가 실행되는 Linux 호스트에서 다음 명령어를 실행하여 커널 파라미터를 업데이트합니다. (root 권한 필요)

      ```bash
      # /etc/sysctl.conf 에 BBR 설정을 추가하거나,
      # 제공된 tcp-algorithm/sysctl.conf 파일을 /etc/sysctl.d/ 에 복사합니다.
      sudo cp tcp-algorithm/sysctl.conf /etc/sysctl.d/99-bbr.conf

      # 설정 적용
      sudo sysctl -p /etc/sysctl.d/99-bbr.conf
      ```

3.  **확인:**
    - 설정을 적용한 후, 다시 테스트를 실행하고 브라우저 개발자 도구에서 응답 헤더를 확인합니다. `X-TCP-Congestion-Control` 값이 `bbr`로 변경된 것을 볼 수 있습니다.

## 고급: DNS 기반 프록시 자동 탐지 (WPAD)

수동으로 PAC 파일 URL을 설정하는 대신, WPAD를 사용하여 클라이언트가 프록시 설정을 자동으로 찾도록 구성할 수 있습니다. 이 프로젝트는 `dnsmasq`를 이용한 WPAD 설정을 지원합니다.

### WPAD 설정 방법

1.  **dnsmasq 설치:**

    - 호스트 머신(로컬 컴퓨터)에 `dnsmasq`를 설치합니다. 예를 들어, macOS에서는 Homebrew를 사용하여 설치할 수 있습니다:
      ```bash
      brew install dnsmasq
      ```

2.  **dnsmasq 설정:**

    - `proxy-auto-config/dnsmasq.conf` 파일을 `dnsmasq`의 설정 파일 경로(예: `/usr/local/etc/dnsmasq.conf` 또는 `/etc/dnsmasq.conf`)에 복사하거나 내용을 참고하여 설정합니다.
    - `address=/wpad/192.168.68.53` 설정은 `wpad`라는 호스트 이름에 대한 DNS 요청을 Nginx 프록시 서버의 IP 주소로 응답하도록 지시합니다. (IP 주소는 실제 환경에 맞게 조정해야 할 수 있습니다.)

3.  **DNS 서버 변경:**

    - 운영체제의 네트워크 설정에서 DNS 서버를 로컬 머신(127.0.0.1)으로 변경합니다. 이렇게 하면 모든 DNS 요청이 `dnsmasq`를 통해 처리됩니다.

4.  **프록시 자동 탐지 활성화:**
    - 브라우저 또는 운영체제의 프록시 설정에서 "프록시 설정 자동 탐지" 옵션을 활성화합니다.

이제 브라우저는 시작 시 `http://wpad/wpad.dat` 주소로 PAC 파일을 자동으로 요청하여 프록시 설정을 완료하게 됩니다.
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
# network-optimization
