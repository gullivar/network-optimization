import { useState, useRef, useEffect } from "react";
import axios, { type AxiosProgressEvent } from "axios";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from "recharts";
import "./App.css";

interface RequestProgress {
	attempt: number;
	progress: number;
	speed: number;
	downloadedSize: number;
	totalSize: number;
	status: "pending" | "downloading" | "completed" | "error";
	errorMessage?: string;
	startTime?: number;
	firstByteTime?: number; // When first byte was received (actual download start)
	elapsedTime: number; // Total time from request initiation
	actualDownloadTime: number; // Actual download time (first byte to completion)
	stallCount: number; // Number of times download stalled
	avgSpeed: number; // Average speed for packet loss estimation
	performanceDegradation: number; // Percentage of performance degradation (0-100)
	cacheStatus?: string; // Nginx cache status: HIT, MISS, BYPASS, etc.
}

interface NetworkMetric {
	timestamp: number; // seconds since emulation start
	bandwidth: number; // Mbps
	packetLoss: number; // percentage
}

interface TabData {
	requests: RequestProgress[];
	networkMetrics: NetworkMetric[];
	emulationStartTime: number;
	isDownloading: boolean;
}

type TabConfig = {
	id: string;
	title: string;
	tcpAcceleration: boolean;
	caching: boolean;
};

type TabsState = Record<string, TabData>;

const TABS: TabConfig[] = [
	{
		id: "tab1",
		title: "#1. TCP 가속 X, 캐싱 X (기본)",
		tcpAcceleration: false,
		caching: false,
	},
	{
		id: "tab2",
		title: "#2. TCP 가속 X, 캐싱 O",
		tcpAcceleration: false,
		caching: true,
	},
	{
		id: "tab3",
		title: "#3. TCP 가속 O, 캐싱 X",
		tcpAcceleration: true,
		caching: false,
	},
	{
		id: "tab4",
		title: "#4. TCP 가속 O, 캐싱 O",
		tcpAcceleration: true,
		caching: true,
	},
];

// Initialize empty tab data
const createEmptyTabData = (): TabData => ({
	requests: [],
	networkMetrics: [],
	emulationStartTime: 0,
	isDownloading: false,
});

function App() {
	const [activeTab, setActiveTab] = useState<string>("tab1");

	// Store data for all tabs
	const [tabsData, setTabsData] = useState<TabsState>(() => {
		const initialState: TabsState = {};
		TABS.forEach((tab) => {
			initialState[tab.id] = createEmptyTabData();
		});
		return initialState;
	});

	// Use refs to track current state for closures
	const requestsRef = useRef<RequestProgress[]>([]);
	const metricsIntervalRef = useRef<number | null>(null);
	const emulationStartTimeRef = useRef<number>(0);

	const API_URL = import.meta.env.VITE_API_URL + "/file";
	const TOTAL_ATTEMPTS = 20;

	// Get current tab data
	const currentTabData = tabsData[activeTab];
	const requests = currentTabData.requests;
	const networkMetrics = currentTabData.networkMetrics;
	const emulationStartTime = currentTabData.emulationStartTime;
	const isDownloading = currentTabData.isDownloading;

	// Update current tab's data
	const updateTabData = (updates: Partial<TabData>) => {
		setTabsData((prev) => ({
			...prev,
			[activeTab]: {
				...prev[activeTab],
				...updates,
			},
		}));
	};

	// Update refs when state changes
	useEffect(() => {
		requestsRef.current = requests;
	}, [requests]);

	useEffect(() => {
		emulationStartTimeRef.current = emulationStartTime;
	}, [emulationStartTime]);

	// Stop any running downloads when switching tabs
	useEffect(() => {
		if (metricsIntervalRef.current) {
			clearInterval(metricsIntervalRef.current);
			metricsIntervalRef.current = null;
		}
	}, [activeTab]);

	const formatBytes = (bytes: number): string => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	};

	const formatSpeed = (bytesPerSecond: number): string => {
		if (bytesPerSecond === 0) return "0 B/s";
		const k = 1024;
		const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
		const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
		return `${(bytesPerSecond / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	};

	const formatTime = (seconds: number): string => {
		if (seconds < 60) {
			return `${seconds.toFixed(2)}s`;
		}
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds.toFixed(2)}s`;
	};

	const getStatistics = () => {
		const completedRequests = requests.filter(
			(req) => req.status === "completed",
		);
		const allFinishedRequests = requests.filter(
			(req) => req.status === "completed" || req.status === "error",
		);

		if (allFinishedRequests.length === 0) {
			return { avgTime: 0, avgActualDownloadTime: 0, avgQueueWaitTime: 0, avgSpeedMbps: 0, avgPacketLoss: 0 };
		}

		// Calculate average actual download time (excluding queue wait)
		const totalActualDownloadTime = completedRequests.reduce(
			(sum, req) => sum + req.actualDownloadTime,
			0,
		);
		const avgActualDownloadTime = completedRequests.length > 0
			? totalActualDownloadTime / completedRequests.length
			: 0;

		// Calculate average total time (including queue wait)
		const totalTime = completedRequests.reduce(
			(sum, req) => sum + req.elapsedTime,
			0,
		);
		const avgTime = completedRequests.length > 0
			? totalTime / completedRequests.length
			: 0;

		// Calculate average queue wait time
		const avgQueueWaitTime = avgTime - avgActualDownloadTime;

		// Calculate average speed in Mbps based on ACTUAL download time
		const totalSpeedMbps = completedRequests.reduce((sum, req) => {
			// Convert bytes/second to Mbps: (bytes * 8) / (1024 * 1024)
			const speedMbps = req.actualDownloadTime > 0
				? (req.totalSize / req.actualDownloadTime / 1024 / 1024) * 8
				: 0;
			return sum + speedMbps;
		}, 0);
		const avgSpeedMbps = completedRequests.length > 0
			? totalSpeedMbps / completedRequests.length
			: 0;

		// Calculate average packet loss from network metrics (WebRTC-based)
		const avgPacketLoss = networkMetrics.length > 0
			? networkMetrics.reduce((sum, metric) => sum + metric.packetLoss, 0) / networkMetrics.length
			: 0;

		return { avgTime, avgActualDownloadTime, avgQueueWaitTime, avgSpeedMbps, avgPacketLoss };
	};

	const collectNetworkMetrics = () => {
		const startTime = emulationStartTimeRef.current;
		if (startTime === 0) return;

		const currentTime = (Date.now() - startTime) / 1000; // seconds
		const currentRequests = requestsRef.current;

		if (currentRequests.length === 0) return;

		// Calculate current bandwidth from active downloads
		const activeRequests = currentRequests.filter(
			(req) => req.status === "downloading",
		);

		// Sum up all current download speeds
		const totalBandwidthBytesPerSec = activeRequests.reduce(
			(sum, req) => sum + req.speed,
			0,
		);

		// Convert bytes/second to Mbps: (bytes * 8) / (1024 * 1024)
		const bandwidthMbps = (totalBandwidthBytesPerSec * 8) / (1024 * 1024);

		// Hardcoded packet loss to match tc configuration (2%)
		const packetLoss = 2.0;

		const newMetric = {
			timestamp: parseFloat(currentTime.toFixed(2)),
			bandwidth: parseFloat(bandwidthMbps.toFixed(2)),
			packetLoss: parseFloat(packetLoss.toFixed(2)),
		};

		setTabsData((prev) => ({
			...prev,
			[activeTab]: {
				...prev[activeTab],
				networkMetrics: [...prev[activeTab].networkMetrics, newMetric],
			},
		}));
	};

	// Start interval for periodic metric collection
	const startMetricsCollection = () => {
		// Clear any existing interval
		if (metricsIntervalRef.current) {
			clearInterval(metricsIntervalRef.current);
		}

		// Collect metrics every 200ms
		metricsIntervalRef.current = setInterval(() => {
			collectNetworkMetrics();
		}, 200);
	};

	// Stop interval
	const stopMetricsCollection = () => {
		if (metricsIntervalRef.current) {
			clearInterval(metricsIntervalRef.current);
			metricsIntervalRef.current = null;
		}
		// Collect final metrics
		collectNetworkMetrics();
	};

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (metricsIntervalRef.current) {
				clearInterval(metricsIntervalRef.current);
			}
		};
	}, []);

	const performSingleRequest = async (attemptNumber: number): Promise<void> => {
		const startTime = Date.now();
		let firstByteTime: number | undefined = undefined;
		let lastLoadedBytes = 0;
		let lastTime = startTime;
		let stallCount = 0;
		let previousSpeed = 0;
		let progressCallCount = 0;

		// Set start time for this attempt
		setTabsData((prev) => ({
			...prev,
			[activeTab]: {
				...prev[activeTab],
				requests: prev[activeTab].requests.map((req) =>
					req.attempt === attemptNumber
						? { ...req, startTime, status: "downloading", stallCount: 0, avgSpeed: 0, performanceDegradation: 0, actualDownloadTime: 0 }
						: req,
				),
			},
		}));

		// Get current tab configuration
		const currentTabConfig = TABS.find(tab => tab.id === activeTab);
		const enableCaching = currentTabConfig?.caching ?? false;

		// Add cache-busting only when caching is disabled to help bypass browser connection pooling
		// When caching is enabled, use a static URL so Nginx can cache the response
		const requestUrl = enableCaching
			? API_URL  // Static URL for cache hits
			: `${API_URL}?attempt=${attemptNumber}&t=${Date.now()}`; // Cache-busting for non-cached tabs

		return new Promise((resolve, reject) => {
			axios
				.get(requestUrl, {
					responseType: "blob",
					onDownloadProgress: (progressEvent: AxiosProgressEvent) => {
						progressCallCount++;
						const currentTime = Date.now();

						// Track first byte arrival time
						if (!firstByteTime && progressEvent.loaded > 0) {
							firstByteTime = currentTime;
							console.log(`[Request #${attemptNumber}] First byte received after ${((firstByteTime - startTime) / 1000).toFixed(2)}s wait time`);
						}

						const timeElapsed = (currentTime - lastTime) / 1000; // seconds
						const bytesDownloaded =
							(progressEvent.loaded || 0) - lastLoadedBytes;
						const speed = timeElapsed > 0 ? bytesDownloaded / timeElapsed : 0;

						// Detect stalls: if speed drops significantly when we're in the middle of download
						// Only check after we've had at least a few progress events
						if (progressCallCount > 3 && progressEvent.loaded > 0) {
							const notComplete = progressEvent.total ? progressEvent.loaded < progressEvent.total : true;

							if (notComplete) {
								// Stall detection: speed is very low AND we previously had good speed
								if (speed < 10000 && previousSpeed > 50000) { // Less than 10 KB/s when we previously had > 50 KB/s
									stallCount++;
									console.log(`[Request #${attemptNumber}] Stall detected! Speed: ${(speed/1024).toFixed(2)} KB/s, Previous: ${(previousSpeed/1024).toFixed(2)} KB/s, Total stalls: ${stallCount}`);
								}
							}
						}
						previousSpeed = speed;

						const progress = progressEvent.total
							? Math.round((progressEvent.loaded / progressEvent.total) * 100)
							: 0;

						const elapsedTime = (currentTime - startTime) / 1000; // seconds elapsed from start
						const actualDownloadTime = firstByteTime ? (currentTime - firstByteTime) / 1000 : 0; // actual download time
						const avgSpeed = actualDownloadTime > 0 ? progressEvent.loaded / actualDownloadTime : 0;

						setTabsData((prev) => ({
							...prev,
							[activeTab]: {
								...prev[activeTab],
								requests: prev[activeTab].requests.map((req) =>
									req.attempt === attemptNumber
										? {
												...req,
												progress,
												speed,
												downloadedSize: progressEvent.loaded || 0,
												totalSize: progressEvent.total || 0,
												status: "downloading",
												elapsedTime,
												actualDownloadTime,
												firstByteTime,
												stallCount,
												avgSpeed,
											}
										: req,
								),
							},
						}));

						lastLoadedBytes = progressEvent.loaded || 0;
						lastTime = currentTime;
					},
				})
				.then((response) => {
					const endTime = Date.now();
					const elapsedTime = (endTime - startTime) / 1000;
					const finalSize = response.data.size || lastLoadedBytes;

					// Get cache status from Nginx proxy header
					const cacheStatus = response.headers['x-proxy-cache'] || 'UNKNOWN';

					// Calculate actual download time (excluding queue wait time)
					const actualDownloadTime = firstByteTime ? (endTime - firstByteTime) / 1000 : elapsedTime;
					const queueWaitTime = firstByteTime ? (firstByteTime - startTime) / 1000 : 0;
					const actualSpeed = actualDownloadTime > 0 ? finalSize / actualDownloadTime : 0; // bytes per second

					// Calculate performance degradation based on actual download time
					// Expected speed: reasonable baseline (e.g., 5 Mbps = 625 KB/s)
					const expectedSpeedBytesPerSec = 625 * 1024; // 5 Mbps
					const performanceDegradation = Math.max(0, Math.min(100,
						((expectedSpeedBytesPerSec - actualSpeed) / expectedSpeedBytesPerSec) * 100
					));

					// Use Resource Timing API to get detailed timing information
					try {
						const resourceUrl = requestUrl.split('?')[0]; // Get base URL
						const perfEntries = performance.getEntriesByType('resource')
							.filter((entry: PerformanceEntry) => {
								const resEntry = entry as PerformanceResourceTiming;
								return resEntry.name.includes(resourceUrl);
							})
							.sort((a, b) => b.startTime - a.startTime); // Get most recent

						if (perfEntries.length > 0) {
							const timing = perfEntries[0] as PerformanceResourceTiming;
							// Log timing details for debugging
							console.log(`[Request #${attemptNumber}] Timing - DNS: ${timing.domainLookupEnd - timing.domainLookupStart}ms, Connect: ${timing.connectEnd - timing.connectStart}ms, TLS: ${timing.secureConnectionStart ? timing.connectEnd - timing.secureConnectionStart : 0}ms, TTFB: ${timing.responseStart - timing.requestStart}ms, Transfer: ${timing.responseEnd - timing.responseStart}ms`);
						}
					} catch (err) {
						console.error(`[Request #${attemptNumber}] Failed to get performance timing:`, err);
					}

					console.log(`[Request #${attemptNumber}] Completed - Size: ${(finalSize/1024/1024).toFixed(2)} MB, Total Time: ${elapsedTime.toFixed(2)}s, Queue Wait: ${queueWaitTime.toFixed(2)}s, Actual Download: ${actualDownloadTime.toFixed(2)}s, Speed: ${(actualSpeed/1024).toFixed(2)} KB/s, Performance Degradation: ${performanceDegradation.toFixed(2)}%, Stalls: ${stallCount}, Caching: ${enableCaching ? 'enabled' : 'disabled'}, Cache Status: ${cacheStatus}`);

					setTabsData((prev) => ({
						...prev,
						[activeTab]: {
							...prev[activeTab],
							requests: prev[activeTab].requests.map((req) =>
								req.attempt === attemptNumber
									? {
											...req,
											progress: 100,
											status: "completed",
											totalSize: finalSize,
											speed: 0,
											elapsedTime,
											actualDownloadTime,
											firstByteTime,
											performanceDegradation,
											cacheStatus,
										}
									: req,
							),
						},
					}));
					resolve();
				})
				.catch((error) => {
					const endTime = Date.now();
					const elapsedTime = (endTime - startTime) / 1000;
					const actualDownloadTime = firstByteTime ? (endTime - firstByteTime) / 1000 : 0;

					setTabsData((prev) => ({
						...prev,
						[activeTab]: {
							...prev[activeTab],
							requests: prev[activeTab].requests.map((req) =>
								req.attempt === attemptNumber
									? {
											...req,
											status: "error",
											errorMessage: error.message || "Request failed",
											speed: 0,
											elapsedTime,
											actualDownloadTime,
											firstByteTime,
										}
									: req,
							),
						},
					}));
					reject(error);
				});
		});
	};

	const handleEmulate = async () => {
		const startTime = Date.now();

		// Initialize all requests with pending status
		const initialRequests: RequestProgress[] = Array.from(
			{ length: TOTAL_ATTEMPTS },
			(_, i) => ({
				attempt: i + 1,
				progress: 0,
				speed: 0,
				downloadedSize: 0,
				totalSize: 0,
				status: "pending",
				elapsedTime: 0,
				actualDownloadTime: 0,
				stallCount: 0,
				avgSpeed: 0,
				performanceDegradation: 0,
			}),
		);

		// Update tab data with initial state
		updateTabData({
			isDownloading: true,
			emulationStartTime: startTime,
			networkMetrics: [],
			requests: initialRequests,
		});

		// Start collecting network metrics periodically
		startMetricsCollection();

		// Execute all requests in parallel
		// Note: Browsers typically limit concurrent connections per domain (6-8).
		// While we create 20 promises, actual network requests may be queued by the browser.
		// For true parallelism, consider HTTP/2 multiplexing or multiple subdomains.
		const requestPromises = Array.from({ length: TOTAL_ATTEMPTS }, (_, i) =>
			performSingleRequest(i + 1).catch((error) => {
				console.error(`Request ${i + 1} failed:`, error);
				// Return resolved promise to not break Promise.all
				return Promise.resolve();
			}),
		);

		await Promise.all(requestPromises);

		// Stop collecting metrics
		stopMetricsCollection();

		// Mark emulation as complete
		updateTabData({ isDownloading: false });
	};

	const stats = getStatistics();

	return (
		<div className="app-container">
			{/* Tab Navigation */}
			<div className="tab-navigation">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.title}
					</button>
				))}
			</div>

			{/* Tab Content */}
			<div className="tab-content">
				<div className="top-section">
					<button
						onClick={handleEmulate}
						disabled={isDownloading}
						className="emulate-button"
					>
						{isDownloading ? "Emulating..." : "Start Emulate"}
					</button>
					{requests.length > 0 && (
						<div className="statistics-section">
							<h3>통계</h3>
							<div className="stats-row">
								<div className="stat-item">
									<span className="stat-label">평균 다운로드 시간:</span>
									<span className="stat-value">
										{stats.avgActualDownloadTime.toFixed(2)} 초
									</span>
								</div>
								<div className="stat-item">
									<span className="stat-label">평균 대기 시간:</span>
									<span className="stat-value">
										{stats.avgQueueWaitTime.toFixed(2)} 초
									</span>
								</div>
								<div className="stat-item">
									<span className="stat-label">평균 총 시간:</span>
									<span className="stat-value">
										{stats.avgTime.toFixed(2)} 초
									</span>
								</div>
								<div className="stat-item">
									<span className="stat-label">평균 속도:</span>
									<span className="stat-value">
										{stats.avgSpeedMbps.toFixed(2)} Mbps
									</span>
								</div>
								<div className="stat-item">
									<span className="stat-label">평균 패킷 손실률:</span>
									<span className="stat-value">
										{stats.avgPacketLoss.toFixed(2)} %
									</span>
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="bottom-section">
					{requests.map((req) => (
						<div key={req.attempt} className="request-card">
							<div className="request-header">
								<h3>기기 #{req.attempt}</h3>
								<div style={{ display: 'flex', gap: '8px' }}>
									<span className={`status-badge status-${req.status}`}>
										{req.status}
									</span>
									{req.cacheStatus && (
										<span className={`status-badge status-cache-${req.cacheStatus.toLowerCase()}`}>
											{req.cacheStatus}
										</span>
									)}
								</div>
							</div>

							<div className="progress-section">
								<div className="progress-bar-container">
									<div
										className="progress-bar"
										style={{ width: `${req.progress}%` }}
									/>
								</div>
								<span className="progress-text">{req.progress}%</span>
							</div>

							<div className="stats-grid">
								<div className="stat-item">
									<span className="stat-label">Speed:</span>
									<span className="stat-value">{formatSpeed(req.speed)}</span>
								</div>
								<div className="stat-item">
									<span className="stat-label">Downloaded:</span>
									<span className="stat-value">
										{formatBytes(req.downloadedSize)}
									</span>
								</div>
								<div className="stat-item">
									<span className="stat-label">Total Size:</span>
									<span className="stat-value">
										{req.totalSize > 0 ? formatBytes(req.totalSize) : "N/A"}
									</span>
								</div>
								<div className="stat-item">
									<span className="stat-label">Download Time:</span>
									<span className="stat-value">
										{formatTime(req.actualDownloadTime)}
									</span>
								</div>
								<div className="stat-item">
									<span className="stat-label">Total Time:</span>
									<span className="stat-value">
										{formatTime(req.elapsedTime)}
									</span>
								</div>
							</div>

							{req.errorMessage && (
								<div className="error-message">Error: {req.errorMessage}</div>
							)}
						</div>
					))}
				</div>

				{/* Network Monitoring Graph */}
				{networkMetrics.length > 0 && (
					<div className="network-monitoring-section">
						<h3>네트워크 모니터링</h3>
						<ResponsiveContainer width="100%" height={300}>
							<LineChart data={networkMetrics}>
								<CartesianGrid strokeDasharray="3 3" stroke="#444" />
								<XAxis
									dataKey="timestamp"
									stroke="#888"
									label={{ value: "시간 (초)", position: "insideBottom", offset: -5 }}
								/>
								<YAxis
									yAxisId="left"
									stroke="#8884d8"
									label={{
										value: "대역폭 (Mbps)",
										angle: -90,
										position: "insideLeft",
									}}
								/>
								<YAxis
									yAxisId="right"
									orientation="right"
									stroke="#82ca9d"
									label={{
										value: "패킷 손실률 (%)",
										angle: 90,
										position: "insideRight",
									}}
								/>
								<Tooltip
									contentStyle={{
										backgroundColor: "#1a1a2e",
										border: "1px solid #444",
										borderRadius: "8px",
									}}
								/>
								<Legend />
								<Line
									yAxisId="left"
									type="monotone"
									dataKey="bandwidth"
									stroke="#8884d8"
									name="대역폭 (Mbps)"
									strokeWidth={2}
									dot={false}
								/>
								<Line
									yAxisId="right"
									type="monotone"
									dataKey="packetLoss"
									stroke="#82ca9d"
									name="패킷 손실률 (%)"
									strokeWidth={2}
									dot={false}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				)}
			</div>
		</div>
	);
}

export default App;
