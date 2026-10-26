# ObjectDetect PWA — First build

Browser-based port of the original Windows Python/OpenCV Canny contour detector. Uses the camera of the device running the PWA. **No Python server and no cloud processing**.

## Original detection settings preserved
- Canny 50 / 150; aperture 3, L2 gradient
- Gaussian blur 5×5, sigma 1.4
- Morphological closing 3×3
- External contours, simple chain approximation
- Minimum area 1500 px²
- Polygon approximation 0.02 × perimeter
- Rectangles: four convex vertices, right-angle cosine tolerance 0.20, square side ratio <1.15
- Circles: >=7 polygon vertices, circularity >0.80
- Centroid matching 80px; missing track retention 10 frames (only live detections drawn)

## Run locally on Windows (first test)
1. Run `SETUP_OPENCV_WINDOWS.bat` to download the official OpenCV.js browser build into `lib/` (requires internet). If that particular OpenCV.js build requests an additional `.wasm` file, place its matching WASM file in `lib/` and add it to the service-worker asset list.
2. From this folder run: `python -m http.server 8000`
3. Open `http://localhost:8000` in Chrome/Edge. Grant camera permission, choose a camera, and click **Start camera**.
4. Stop server with Ctrl+C.

## Deploy to Chromebook and iPad
Upload this folder to a static **HTTPS** host. Open the URL in Chrome (Chromebook/Windows) or Safari (iPad), grant camera access, and install via the browser install menu / Safari Share → Add to Home Screen. For offline operation, open the app once online and ensure the service worker has successfully cached **all** resources before disconnecting.

## Important limitations
- This is a first port; actual performance and detection parity must be validated on real devices.
- Browser camera names/selection depend on camera permissions and OS. External iPad USB webcams may not be exposed by Safari.
- `getUserMedia` needs HTTPS or localhost and user permission; opening `index.html` with `file://` is not sufficient.
- `service-worker.js` uses cache-first assets. Increment `CACHE` when shipping updates.
- If your OpenCV.js distribution loads a separate WASM file, ensure that file is deployed and included in the offline cache.
- iPad PWA install and offline behavior depend on iPadOS/Safari version and storage policies.
- Processing uses the main UI thread; slower tablets may not reach 30 FPS. A worker-based optimization can follow after functional testing.
