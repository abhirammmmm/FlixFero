const fileInput = document.getElementById('fileInput');
const sendBtn = document.getElementById('sendBtn');
const statusDiv = document.getElementById('status');

let localConnection;
let remoteConnection;
let sendChannel;
let receiveChannel;
let ws;

let file;

// Open WebSocket connection for signaling
// Use the exact WebSocket endpoint
ws = new WebSocket(`ws://${window.location.host}/ws`);


ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    if (message.answer) {
        await localConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
    } else if (message.offer) {
        await handleOffer(message.offer);
    } else if (message.iceCandidate) {
        const candidate = new RTCIceCandidate(message.iceCandidate);
        await localConnection.addIceCandidate(candidate);
    }
};

fileInput.addEventListener('change', (e) => {
    file = e.target.files[0];
});

sendBtn.addEventListener('click', () => {
    if (file) {
        createConnection();
    } else {
        alert('Please select a file first');
    }
});

async function createConnection() {
    localConnection = new RTCPeerConnection();

    // Create data channel for sending file
    sendChannel = localConnection.createDataChannel('sendDataChannel');
    sendChannel.binaryType = 'arraybuffer';

    sendChannel.onopen = () => {
        statusDiv.innerHTML = 'Connection opened, sending file...';
        sendFile();
    };

    sendChannel.onclose = () => {
        statusDiv.innerHTML = 'File sent!';
    };

    localConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            ws.send(JSON.stringify({ 'iceCandidate': candidate }));
        }
    };

    const offer = await localConnection.createOffer();
    await localConnection.setLocalDescription(offer);

    ws.send(JSON.stringify({ 'offer': offer }));
}

async function handleOffer(offer) {
    localConnection = new RTCPeerConnection();

    localConnection.ondatachannel = (event) => {
        receiveChannel = event.channel;
        receiveChannel.binaryType = 'arraybuffer';
        receiveChannel.onmessage = onReceiveMessage;
    };

    localConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            ws.send(JSON.stringify({ 'iceCandidate': candidate }));
        }
    };

    await localConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await localConnection.createAnswer();
    await localConnection.setLocalDescription(answer);

    ws.send(JSON.stringify({ 'answer': answer }));
}

function onReceiveMessage(event) {
    const arrayBuffer = event.data;
    saveFile(arrayBuffer);
}

function saveFile(data) {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file ? file.name : 'received_file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    statusDiv.innerHTML = 'File received!';
}

function sendFile() {
    const chunkSize = 16384;
    const fileReader = new FileReader();
    let offset = 0;

    fileReader.addEventListener('error', error => console.error('Error reading file:', error));
    fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
    fileReader.addEventListener('load', e => {
        sendChannel.send(e.target.result);
        offset += e.target.result.byteLength;
        if (offset < file.size) {
            readSlice(offset);
        } else {
            sendChannel.close();
        }
    });

    const readSlice = o => {
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };
    readSlice(0);
}
