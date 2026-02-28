const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const express = require("express");
const app = express();
const port = 3000;

let latestDistance = 0;
let measuring = true; // whether to process incoming data and update distance

// Try to connect to serial port, but don't crash if it fails
try {
  const serialPort = new SerialPort({ path: "COM5", baudRate: 9600 });
  const parser = serialPort.pipe(new ReadlineParser({ delimiter: "\r\n" }));

  parser.on("data", data => {
    if (!measuring) {
      // ignore readings while paused
      return;
    }
    data = data.trim(); // remove spaces/newlines
    if(!isNaN(data) && data !== "") { // only valid numbers
      latestDistance = Number(data);
      console.log("Distance:", latestDistance);
    }
  });

  serialPort.on("error", (err) => {
    console.error("Serial Port Error:", err.message);
  });
} catch (err) {
  console.warn("Serial port connection failed (running in demo mode):", err.message);
  // Simulate data for testing
  setInterval(() => {
    latestDistance = Math.floor(Math.random() * 150);
  }, 1000);
}

app.get("/distance", (req, res) => {
  res.json({ distance: latestDistance });
});

// control endpoint for toggling measurement on/off from client
app.get("/control", (req, res) => {
  const m = req.query.measure;
  if (m === "on") {
    measuring = true;
    console.log("Measurement resumed by client");
  } else if (m === "off") {
    measuring = false;
    console.log("Measurement paused by client");
  }
  res.json({ measuring });
});

app.use(express.static(__dirname));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});