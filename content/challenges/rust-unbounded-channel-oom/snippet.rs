use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::sleep;

#[derive(Debug, Clone)]
pub struct TelemetryEvent {
    pub sensor_id: String,
    pub timestamp: u64,
    pub payload: Vec<u8>,
}

pub struct TelemetryPipeline {
    sender: mpsc::UnboundedSender<TelemetryEvent>,
}

impl TelemetryPipeline {
    pub fn new() -> (Self, mpsc::UnboundedReceiver<TelemetryEvent>) {
        // Instantiate unbounded channel between ingest workers and storage batcher
        let (tx, rx) = mpsc::unbounded_channel::<TelemetryEvent>();
        (Self { sender: tx }, rx)
    }

    pub fn enqueue_event(&self, event: TelemetryEvent) -> Result<(), &'static str> {
        // Sends immediately without backpressure or bounded capacity check
        self.sender
            .send(event)
            .map_err(|_| "Failed to enqueue event: receiver dropped")
    }
}

pub async fn run_storage_consumer(mut rx: mpsc::UnboundedReceiver<TelemetryEvent>) {
    while let Some(event) = rx.recv().await {
        // Simulate slow disk write or external database latency
        sleep(Duration::from_millis(10)).await;
        println!("Persisted telemetry for sensor: {}", event.sensor_id);
    }
}
