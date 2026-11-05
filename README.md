# Video Splitter AI (site estático)
Tudo roda no navegador com FFmpeg.wasm: nenhum vídeo sai do dispositivo.

Hospedagem: suba `index.html`, `style.css` e `script.js` na raiz de qualquer hospedagem estática (GitHub Pages, Netlify, Vercel...). Precisa abrir por http(s) e ter internet na 1ª carga, para baixar o FFmpeg (~30 MB, depois fica em cache).
Teste local: `python3 -m http.server` na pasta e abra http://localhost:8000

Limites: o navegador precisa de memória para guardar as partes geradas e o ZIP. Prefira computador; arquivos de alguns GB podem esgotar a memória (nesse caso, gere mais partes e baixe-as uma a uma).
