let loading;
export async function describeFace(canvas) {
  const api = window.faceapi;
  if (!api) throw new Error('Face engine could not load. Reload this page and try again.');
  loading ??= Promise.all([
    api.nets.tinyFaceDetector.loadFromUri('/models'),
    api.nets.faceLandmark68Net.loadFromUri('/models'),
    api.nets.faceRecognitionNet.loadFromUri('/models'),
  ]).catch(error => { loading = null; throw error; });
  await loading;
  const faces = await api.detectAllFaces(canvas,new api.TinyFaceDetectorOptions({inputSize:512,scoreThreshold:0.5})).withFaceLandmarks().withFaceDescriptors();
  if (!faces.length) throw new Error('No face found. Face the camera in good light and try again.');
  if (faces.length !== 1) throw new Error('More than one face found. Use a photo of just one person.');
  if (faces[0].detection.box.width < 80 || faces[0].detection.box.height < 80) throw new Error('Move closer: the face is too small to recognize reliably.');
  return Array.from(faces[0].descriptor);
}
