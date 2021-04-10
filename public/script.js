'use strict';

const video = document.getElementById('video');

Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    //faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
    //faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    faceapi.nets.faceExpressionNet.loadFromUri('/models'),
]).then(() => {
    setInterval(async() => {
        const detections = await faceapi.detectAllFaces(
            video,
            new faceapi.TinyFaceDetectorOptions(),
        ).withFaceExpressions();

        if (!detections.length) {
            return;
        }

        const [detection] = detections;

        const sortedExpressions = Object.entries(detection.expressions).sort(([, value1], [, value2]) => value2 - value1);

        const [[expression]] = sortedExpressions;

        console.log(expression);
    }, 5000);
});
