export async function logClickEvent(event) {
  // Fetch the client's IP address
  let clientIp = null;
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    clientIp = data.ip;
  } catch (error) {
    console.error("Error fetching IP address:", error);
  }

  // Extract inner text from the element, or default to an empty string
  const targetText = event.target.innerText || event.target.textContent || "";

  const logData = {
    eventType: 'click',
    targetTag: event.target.tagName,
    targetId: event.target.id || null,
    targetClasses: event.target.className || null,
    targetText,  // Newly added: inner text of the element
    timestamp: new Date().toISOString(),
    clientIp,
    clientUrl: window.location.href
  };

  console.log("User Action Logged:", logData);

  try {
    const result = await fetch('/api/log_event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logData)
    });

    if (!result.ok) {
      const errorText = await result.text();
      console.error(
        `Error logging event: Status ${result.status} (${result.statusText}). Response: ${errorText}`
      );
    }else {
      console.log("Event logged successfully.");
    }
  } catch (err) {
    console.error("Error sending log event:", err);
  }
}
