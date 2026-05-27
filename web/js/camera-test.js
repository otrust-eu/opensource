// Simple camera test
document.getElementById('btn').addEventListener('click', async function() {
  const status = document.getElementById('status');
  const video = document.getElementById('video');
  
  status.textContent = 'Requesting camera...';
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    status.textContent = '✅ Camera OK!';
    status.style.color = 'green';
  } catch (e) {
    status.textContent = '❌ Error: ' + e.message;
    status.style.color = 'red';
    console.error('Camera error:', e);
  }
});

console.log('Camera test script loaded');
