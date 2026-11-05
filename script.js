import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

// ELEMENTOS
const videoInput = document.getElementById("videoInput");
const uploadArea = document.getElementById("uploadArea");
const videoInfo = document.getElementById("videoInfo");
const videoPreview = document.getElementById("videoPreview");
const fileName = document.getElementById("fileName");
const fileDetails = document.getElementById("fileDetails");
const removeVideo = document.getElementById("removeVideo");

const startBtn = document.getElementById("startBtn");
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");
const progressPercent = document.getElementById("progressPercent");
const progressStatus = document.getElementById("progressStatus");
const progressDetails = document.getElementById("progressDetails");

const results = document.getElementById("results");
const clipsList = document.getElementById("clipsList");
const resultCount = document.getElementById("resultCount");
const downloadAll = document.getElementById("downloadAll");
const customDuration = document.getElementById("customDuration");

// ESTADO
const ffmpeg = new FFmpeg();

let selectedFile = null;
let selectedDuration = 60;
let videoDuration = 0;
let clips = [];
let videoURL = null;
let isProcessing = false;
let ffmpegLoaded = false;
let currentClip = 0;
let totalClips = 1;

// FORMATAÇÃO DE TEMPO
function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hours > 0) {
        return [hours, minutes, secs]
            .map(n => String(n).padStart(2, "0"))
            .join(":");
    }

    return [minutes, secs]
        .map(n => String(n).padStart(2, "0"))
        .join(":");
}

// FORMATAÇÃO DE TAMANHO
function formatSize(bytes) {
    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + " KB";
    }

    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ATUALIZAR PROGRESSO
function updateProgress(value, status, detail) {
    const percent = Math.max(0, Math.min(100, value));

    progressBar.style.width = percent + "%";
    progressPercent.textContent = Math.floor(percent) + "%";

    if (status) {
        progressStatus.textContent = status;
    }

    if (detail) {
        progressDetails.textContent = detail;
    }
}

// SELECIONAR DURAÇÃO
document.querySelectorAll(".duration-btn").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".duration-btn").forEach(btn => {
            btn.classList.remove("active");
        });

        button.classList.add("active");

        selectedDuration = Number(button.dataset.seconds);
        customDuration.value = "";
    });
});

// DURAÇÃO PERSONALIZADA
customDuration.addEventListener("input", () => {
    if (customDuration.value.trim() !== "") {
        document.querySelectorAll(".duration-btn").forEach(btn => {
            btn.classList.remove("active");
        });
    }
});

// OBTER DURAÇÃO ESCOLHIDA
function getCutDuration() {
    const custom = customDuration.value.trim();

    const duration = custom !== ""
        ? Number(custom)
        : selectedDuration;

    if (!Number.isInteger(duration) || duration < 1 || duration > 3600) {
        throw new Error(
            "Escolha uma duração entre 1 e 3600 segundos."
        );
    }

    return duration;
}

// LIMPAR RESULTADOS
function clearResults() {
    clips.forEach(clip => {
        URL.revokeObjectURL(clip.url);
    });

    clips = [];
    clipsList.innerHTML = "";
    results.classList.add("hidden");
}

// CARREGAR VÍDEO
function loadVideo(file) {
    if (isProcessing || !file) return;

    if (!file.size || file.size < 1) {
        alert("O arquivo selecionado está vazio. Escolha outro vídeo.");
        return;
    }

    const allowedExtensions = /\.(mp4|mov|mkv|webm)$/i;

    if (!allowedExtensions.test(file.name)) {
        alert("Formato não suportado. Escolha MP4, MOV, MKV ou WEBM.");
        return;
    }

    clearResults();

    selectedFile = file;
    videoDuration = 0;

    if (videoURL) {
        URL.revokeObjectURL(videoURL);
    }

    videoURL = URL.createObjectURL(file);

    videoPreview.src = videoURL;
    videoPreview.classList.remove("hidden");

    fileName.textContent = file.name;
    fileDetails.textContent = formatSize(file.size) + " • Carregando duração...";

    videoInfo.classList.remove("hidden");
    uploadArea.classList.add("hidden");

    startBtn.disabled = true;

    // Lê a duração quando os metadados estiverem disponíveis.
    const readVideoDuration = () => {
        if (
            Number.isFinite(videoPreview.duration) &&
            videoPreview.duration > 0
        ) {
            videoDuration = videoPreview.duration;

            fileDetails.textContent =
                formatSize(file.size) + " • " + formatTime(videoDuration);

            startBtn.disabled = false;
        }
    };

    videoPreview.onloadedmetadata = readVideoDuration;
    videoPreview.ondurationchange = readVideoDuration;

    videoPreview.onerror = () => {
        fileDetails.textContent =
            formatSize(file.size) + " • Prévia indisponível";

        alert(
            "O navegador não conseguiu abrir a prévia deste vídeo. " +
            "Tente usar um arquivo MP4 compatível."
        );
    };
}

// SELEÇÃO DE ARQUIVO
videoInput.addEventListener("change", event => {
    loadVideo(event.target.files[0]);
});

// ARRASTAR E SOLTAR
uploadArea.addEventListener("dragover", event => {
    event.preventDefault();
    uploadArea.classList.add("dragging");
});

uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragging");
});

uploadArea.addEventListener("drop", event => {
    event.preventDefault();
    uploadArea.classList.remove("dragging");

    const file = event.dataTransfer.files[0];

    loadVideo(file);
});

// REMOVER VÍDEO
function resetVideo() {
    if (isProcessing) return;

    selectedFile = null;
    videoDuration = 0;

    videoInput.value = "";

    if (videoURL) {
        URL.revokeObjectURL(videoURL);
        videoURL = null;
    }

    videoPreview.pause();
    videoPreview.removeAttribute("src");
    videoPreview.load();

    videoPreview.classList.add("hidden");
    videoInfo.classList.add("hidden");
    uploadArea.classList.remove("hidden");

    startBtn.disabled = true;

    clearResults();

    progressContainer.classList.add("hidden");
}

removeVideo.addEventListener("click", resetVideo);

// CARREGAR FFMPEG
async function loadFFmpeg() {
    if (ffmpegLoaded) return;

    updateProgress(
        0,
        "Carregando motor de vídeo...",
        "Preparando FFmpeg.wasm. Isso pode levar alguns instantes."
    );

    const baseURL =
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";

    const coreURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        "text/javascript"
    );

    const wasmURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
    );

    await ffmpeg.load({
        coreURL,
        wasmURL
    });

    ffmpegLoaded = true;
}

// ACOMPANHAR PROCESSAMENTO
ffmpeg.on("progress", ({ progress }) => {
    if (!isProcessing || !Number.isFinite(progress)) return;

    const overall = ((currentClip + progress) / totalClips) * 100;

    updateProgress(
        overall,
        "Cortando vídeo...",
        `Processando parte ${currentClip + 1} de ${totalClips}.`
    );
});

// CRIAR UM CORTE
async function createClip(inputName, outputName, start, duration) {
    const args = [
        "-ss", start.toFixed(3),
        "-i", inputName,
        "-t", duration.toFixed(3),

        "-map", "0:v:0",
        "-map", "0:a?",

        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",

        "-pix_fmt", "yuv420p",

        "-c:a", "aac",
        "-b:a", "128k",

        "-movflags", "+faststart",

        outputName
    ];

    const exitCode = await ffmpeg.exec(args);

    if (exitCode !== 0) {
        throw new Error(
            "O FFmpeg não conseguiu processar uma das partes."
        );
    }

    const data = await ffmpeg.readFile(outputName);

    return new Blob([data], {
        type: "video/mp4"
    });
}

// MOSTRAR RESULTADOS
function renderResults() {
    clipsList.innerHTML = "";

    clips.forEach(clip => {
        const card = document.createElement("div");
        card.className = "clip-card";

        const video = document.createElement("video");
        video.src = clip.url;
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;

        const row = document.createElement("div");
        row.className = "clip-row";

        const info = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = clip.name;

        const duration = document.createElement("span");
        duration.textContent =
            formatTime(clip.duration) + " • " + formatSize(clip.blob.size);

        info.appendChild(title);
        info.appendChild(document.createElement("br"));
        info.appendChild(duration);

        const link = document.createElement("a");
        link.className = "clip-download";
        link.textContent = "↓ Baixar";
        link.href = clip.url;
        link.download = clip.name;

        row.appendChild(info);
        row.appendChild(link);

        card.appendChild(video);
        card.appendChild(row);

        clipsList.appendChild(card);
    });

    resultCount.textContent =
        clips.length + " arquivos gerados com sucesso.";

    results.classList.remove("hidden");
}

// INICIAR CORTES
async function startProcessing() {
    if (!selectedFile || isProcessing) return;

    let cutDuration;

    try {
        cutDuration = getCutDuration();
    } catch (error) {
        alert(error.message);
        return;
    }

    if (!videoDuration || !Number.isFinite(videoDuration)) {
        alert("Aguarde o carregamento das informações do vídeo.");
        return;
    }

    totalClips = Math.ceil(videoDuration / cutDuration);

    if (totalClips > 500) {
        alert(
            "Esse vídeo geraria mais de 500 arquivos. " +
            "Escolha uma duração maior."
        );
        return;
    }

    isProcessing = true;

    startBtn.disabled = true;
    removeVideo.disabled = true;
    videoInput.disabled = true;

    progressContainer.classList.remove("hidden");

    clearResults();

    let inputName = null;

    try {
        updateProgress(
            0,
            "Iniciando...",
            "Preparando os arquivos."
        );

        await loadFFmpeg();

        updateProgress(
            0,
            "Carregando vídeo...",
            "Enviando o arquivo para a memória do navegador."
        );

        const extension = selectedFile.name
            .split(".")
            .pop()
            .toLowerCase();

        inputName = `input.${extension}`;

        await ffmpeg.writeFile(
            inputName,
            new Uint8Array(await selectedFile.arrayBuffer())
        );

        const safeName = selectedFile.name
            .replace(/\.[^/.]+$/, "")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 50) || "video";

        for (let i = 0; i < totalClips; i++) {
            currentClip = i;

            const start = i * cutDuration;

            const duration = Math.min(
                cutDuration,
                videoDuration - start
            );

            const outputName =
                `clip_${String(i + 1).padStart(3, "0")}.mp4`;

            updateProgress(
                (i / totalClips) * 100,
                `Cortando parte ${i + 1} de ${totalClips}`,
                `Trecho: ${formatTime(start)} até ${formatTime(start + duration)}`
            );

            const blob = await createClip(
                inputName,
                outputName,
                start,
                duration
            );

            const url = URL.createObjectURL(blob);

            clips.push({
                name:
                    `${safeName}_parte_${String(i + 1).padStart(3, "0")}.mp4`,
                duration,
                blob,
                url
            });

            await ffmpeg.deleteFile(outputName);
        }

        updateProgress(
            100,
            "Concluído!",
            "Todos os cortes foram gerados."
        );

        renderResults();

        results.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {
        console.error(error);

        alert(
            "Erro ao processar o vídeo: " + error.message +
            "\nTente novamente com um vídeo menor ou em MP4."
        );

    } finally {
        if (inputName && ffmpegLoaded) {
            try {
                await ffmpeg.deleteFile(inputName);
            } catch (error) {
                console.warn("Arquivo temporário não removido:", error);
            }
        }

        isProcessing = false;

        startBtn.disabled = !selectedFile || !videoDuration;
        removeVideo.disabled = false;
        videoInput.disabled = false;
    }
}

// BOTÃO DE PROCESSAMENTO
startBtn.addEventListener("click", startProcessing);

// BAIXAR TODOS EM ZIP
downloadAll.addEventListener("click", async () => {
    if (!clips.length) return;

    downloadAll.disabled = true;
    downloadAll.textContent = "CRIANDO ARQUIVO ZIP...";

    try {
        const zip = new JSZip();

        clips.forEach(clip => {
            zip.file(clip.name, clip.blob);
        });

        const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "STORE"
        });

        const zipURL = URL.createObjectURL(zipBlob);

        const link = document.createElement("a");

        link.href = zipURL;
        link.download = "AutoClip_cortes.zip";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(zipURL);
        }, 60000);

    } catch (error) {
        console.error(error);
        alert("Não foi possível criar o arquivo ZIP.");

    } finally {
        downloadAll.disabled = false;
        downloadAll.textContent = "↓ BAIXAR TODOS EM ZIP";
    }
});

console.log("AutoClip iniciado com sucesso!");
