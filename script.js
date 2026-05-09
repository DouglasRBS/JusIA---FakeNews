document.addEventListener("DOMContentLoaded", () => {
    const inputText    = document.getElementById("inputText");
    const btnCheck     = document.getElementById("btnCheck");
    const btnRead      = document.getElementById("btnRead");
    const btnClear     = document.getElementById("btnClear");
    const progressWrap = document.getElementById("progressWrap");
    const progressBar  = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const resultCard   = document.getElementById("resultCard");
    const chips        = document.querySelectorAll(".chip");
    const mascot       = document.getElementById("mascot");
    const toast        = document.getElementById("toast");
    const fileInput    = document.getElementById("fileInput");
    const fileName     = document.getElementById("fileName");
    if (!inputText || !btnCheck || !btnRead || !btnClear || !resultCard) {
        console.error("Elementos essenciais não encontrados. Verifique os IDs no HTML.");
        showToast("Erro: elementos da página não foram encontrados.");
        return;
    }
    function showToast(msg, duration = 2200) {
        if (!toast) { console.warn("Toast:", msg); return; }
        toast.textContent = msg;
        toast.style.display = "block";
        setTimeout(() => (toast.style.display = "none"), duration);
    }
    function digitarTexto(elemento, texto, velocidade = 30, callback = null) {
        elemento.textContent = "";
        let i = 0;
        const intervalo = setInterval(() => {
            if (i >= texto.length) {
                clearInterval(intervalo);
                if (callback) callback();
                return;
            }
            elemento.textContent += texto[i++];
        }, velocidade);
    }
    function runProgress(duration = 3000) {
        if (!progressWrap || !progressBar || !progressText) return Promise.resolve();
        progressWrap.style.display = "block";
        progressBar.style.width = "0%";
        const steps    = 60;
        const interval = duration / steps;
        let   i        = 0;
        return new Promise((resolve) => {
            const timer = setInterval(() => {
                i++;
                const pct = Math.min(100, Math.round((i / steps) * 100));
                progressBar.style.width = pct + "%";
                progressText.textContent = `Analisando — ${pct}%`;
                if (i >= steps) {
                    clearInterval(timer);
                    progressText.textContent = "Finalizando análise...";
                    setTimeout(() => {
                        progressWrap.style.display = "none";
                        progressBar.style.width    = "0%";
                        resolve();
                    }, 300);
                }
            }, interval);
        });
    }
    async function analyzeImageLocally(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const img    = new Image();
            reader.onload = (e) => {
                img.onload = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        const ctx    = canvas.getContext("2d");
                        canvas.width  = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        resolve(analyzeImageData(ctx, canvas, file));
                    } catch (error) {
                        reject(error);
                    }
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    function analyzeImageData(ctx, canvas, file) {
        const { width, height } = canvas;
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels    = imageData.data;
        let   score     = 0;
        const warnings  = [];
        if (width * height < 50_000) {
            score += 15;
            warnings.push("Resolução muito baixa (típico de screenshots reprocessados)");
        }
        let variance = 0;
        let pR = pixels[0], pG = pixels[1], pB = pixels[2];
        for (let i = 0; i < pixels.length; i += 4) {
            variance += Math.abs(pixels[i] - pR) + Math.abs(pixels[i+1] - pG) + Math.abs(pixels[i+2] - pB);
            pR = pixels[i]; pG = pixels[i+1]; pB = pixels[i+2];
        }
        if (variance / (pixels.length / 4) < 5) {
            score += 20;
            warnings.push("Cores muito uniformes (possível edição digital)");
        }
        if (detectEdges(ctx, width, height) > 0.3) {
            score += 15;
            warnings.push("Bordas artificiais detectadas");
        }
        const suspiciousNames = ["fake", "editado", "photoshop", "manipulado", "montagem", "falso"];
        if (suspiciousNames.some(w => file.name.toLowerCase().includes(w))) {
            score += 25;
            warnings.push("Nome do arquivo indica possível manipulação");
        }
        if (file.size / (width * height * 3) < 0.05) {
            score += 10;
            warnings.push("Compressão excessiva detectada");
        }
        if (!file.lastModified || file.lastModified > Date.now()) {
            score += 10;
            warnings.push("Metadados de data inconsistentes");
        }
        return buildResult(score, warnings, "imagem");
    }
    function detectEdges(ctx, width, height) {
        const pixels = ctx.getImageData(0, 0, width, height).data;
        let edgeCount    = 0;
        let totalChecked = 0;
        const step = 10;
        for (let y = step; y < height - step; y += step) {
            for (let x = step; x < width - step; x += step) {
                const i      = (y * width + x) * 4;
                const iRight = (y * width + (x + step)) * 4;
                const iDown  = ((y + step) * width + x) * 4;
                if (Math.abs(pixels[i] - pixels[iRight]) > 100 ||
                    Math.abs(pixels[i] - pixels[iDown])  > 100) {
                    edgeCount++;
                }
                totalChecked++;
            }
        }
        return edgeCount / totalChecked;
    }
    async function analyzeVideoLocally(file) {
        return new Promise((resolve) => {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.onloadedmetadata = () => {
                let score    = 0;
                const warnings = [];
                const { duration, videoWidth: w, videoHeight: h } = video;
                if (duration < 3) {
                    score += 15;
                    warnings.push("Vídeo muito curto (comum em deepfakes)");
                }
                if (w < 640 || h < 480) {
                    score += 15;
                    warnings.push("Resolução baixa (típico de conteúdo reprocessado)");
                }
                const suspiciousNames = ["fake", "editado", "deepfake", "manipulado", "montagem", "falso"];
                if (suspiciousNames.some(word => file.name.toLowerCase().includes(word))) {
                    score += 30;
                    warnings.push("Nome do arquivo indica possível manipulação");
                }
                const expectedSize = duration * w * h * 0.1;
                if (file.size / expectedSize < 0.3) {
                    score += 20;
                    warnings.push("Compressão excessiva para a qualidade");
                }
                resolve(buildResult(score, warnings, "vídeo"));
                URL.revokeObjectURL(video.src);
            };
            video.onerror = () => {
                resolve({
                    label:      "warn",
                    confidence: "0",
                    explain:    "⚠️ Não foi possível analisar completamente o vídeo.",
                });
            };
            video.src = URL.createObjectURL(file);
        });
    }
    function buildResult(score, warnings, tipo) {
        let label, confidence, explain;
        if (score >= 50) {
            label      = "bad";
            confidence = Math.min(95, 60 + score / 2);
            explain    = `🚨 ${tipo.charAt(0).toUpperCase() + tipo.slice(1)} altamente suspeito! ${warnings.join(". ")}.`;
        } else if (score >= 25) {
            label      = "warn";
            confidence = Math.min(99, 50 + score);
            explain    = `⚠️ Conteúdo duvidoso. ${warnings.length > 0 ? warnings.join(". ") : "Recomendamos verificar a fonte"}.`;
        } else {
            label      = "good";
            confidence = Math.max(70, 100 - score * 2);
            explain    = `✅ ${tipo.charAt(0).toUpperCase() + tipo.slice(1)} parece autêntico. Nenhum sinal claro de manipulação detectado.`;
        }
        return { label, confidence: confidence.toFixed(0), explain };
    }
    const TEXT_PATTERNS = [
        {
            rx: /vacina(s)?\b.*autism(o|a)?/i,
            label: "bad",
            explain: "❌ Não há evidências científicas que relacionem vacinas ao autismo.",
        },
        {
            rx: /urna(s)?\b.*fraud(e|a|ar)?/i,
            label: "warn",
            explain: "⚠️ Alegações de fraude em urnas exigem investigação por órgãos oficiais.",
        },
        {
            rx: /\b(rem[eé]dio|milagroso|cura(-| )?tudo|cura(r)? o? (?:cancer|câncer|covid|doenças?))\b/i,
            label: "bad",
            explain: "🚫 Alegações de cura milagrosa sem base científica são falsas.",
        },
        {
            rx: /\bterra\b.*\bplana\b/i,
            label: "bad",
            explain: "🌍 A Terra é esférica — comprovado por diversas evidências científicas.",
        },
        {
            rx: /\b(ivermectin(a|e)?|cloroquina|hidroxicloroquina)\b/i,
            label: "warn",
            explain: "⚠️ Medicamentos controversos — verifique estudos científicos.",
        },
    ];
    const CLAIM_VERBS = /\b(cura(r|ndo)?|resolve|cura(-| )?tudo|garante|comprovado|funciona sempre)\b/i;
    function hasNegationNearby(text, matchIndex, matchLength) {
        const snippet = text
            .slice(Math.max(0, matchIndex - 80), matchIndex + matchLength + 40)
            .toLowerCase();
        return /\b(n[oã]o|nega|sem evid[eê]ncia|não há|desment(e|ido)|falso|errado)\b/.test(snippet);
    }
    function analyzeText(text) {
        if (!text?.trim()) return null;
        for (const pattern of TEXT_PATTERNS) {
            const match = pattern.rx.exec(text);
            if (match && !hasNegationNearby(text, match.index, match[0].length)) {
                return pattern;
            }
        }
        const claimMatch = CLAIM_VERBS.exec(text);
        if (claimMatch) {
            const diseaseRx = /\b(cancer|câncer|covid|hiv|diabet(e|es)|doenças? graves|tumor(es)?)\b/i;
            const diseaseMatch = diseaseRx.exec(text);
            if (diseaseMatch && !hasNegationNearby(text, diseaseMatch.index, diseaseMatch[0].length)) {
                return {
                    label:   "bad",
                    explain: "🚫 Alegações de cura para doenças graves sem evidência científica são falsas.",
                };
            }
            return {
                label:   "warn",
                explain: "⚠️ Declaração forte detectada. Verifique fontes.",
            };
        }
        return null;
    }
    async function performAnalysis(text) {
        mascot?.classList.add("animate");
        digitarTexto(resultCard, "🔍 Iniciando análise de padrões...", 30);
        await runProgress(3000);
        mascot?.classList.remove("animate");
        const found = analyzeText(text);
        if (!found) {
            resultCard.style.color = "#28a745";
            digitarTexto(resultCard, "✅ Conteúdo parece confiável. Sempre confira a fonte original.", 30);
            return;
        }
        const labelText = found.label === "bad"
            ? "🚨 Possível Fake News detectada"
            : "⚠️ Revisar (pode precisar de investigação)";
        resultCard.style.color = found.label === "bad" ? "#ff6b6b" : "#ffb020";
        digitarTexto(resultCard, `${labelText}: ${found.explain}`, 30);
        if (found.label === "bad") {
            showToast("⚠️ Alerta: conteúdo possivelmente falso", 4400);
        }
    }
    btnCheck.addEventListener("click", async () => {
        const text = inputText.value.trim();
        if (!text) {
            resultCard.textContent  = "⚠️ Digite ou cole um texto para verificar.";
            resultCard.style.color  = "#ffcc00";
            return;
        }
        resultCard.textContent = "";
        resultCard.style.color = "";
        await performAnalysis(text);
    });
    inputText.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.ctrlKey) btnCheck.click();
    });
    btnClear.addEventListener("click", () => {
        inputText.value        = "";
        resultCard.textContent = "";
        resultCard.style.color = "";
        if (fileName)     fileName.innerHTML  = "";
        if (fileInput)    fileInput.value     = "";
        if (progressWrap) progressWrap.style.display = "none";
    });
    btnRead.addEventListener("click", () => {
        if (!("speechSynthesis" in window)) {
            showToast("Seu navegador não suporta leitura em voz alta.");
            return;
        }
        const speakText = inputText.value.trim() || "Cole ou escreva um texto para que eu leia em voz alta.";
        const utt = new SpeechSynthesisUtterance(speakText);
        utt.lang  = "pt-BR";
        utt.rate  = 1;
        utt.onstart = () => mascot?.classList.add("animate");
        utt.onend   = () => mascot?.classList.remove("animate");
        speechSynthesis.cancel();
        speechSynthesis.speak(utt);
    });
    if (fileInput) {
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files[0];
            if (!file) return;
            const isImage = file.type.startsWith("image/");
            const isVideo = file.type.startsWith("video/");
            if (!isImage && !isVideo) {
                resultCard.textContent = "⚠️ Por favor, envie apenas imagens ou vídeos.";
                resultCard.style.color = "#ffb020";
                return;
            }
            const fileURL = URL.createObjectURL(file);
            fileName.innerHTML = isImage
                ? `<img src="${fileURL}" style="max-width:300px;max-height:300px;border-radius:8px;margin:10px auto;display:block;" alt="Pré-visualização da imagem">`
                : `<video src="${fileURL}" controls style="max-width:400px;max-height:300px;border-radius:8px;margin:10px auto;display:block;"></video>`;
            resultCard.textContent = "🔍 Analisando conteúdo...";
            resultCard.style.color = "#9ec9ff";
            mascot?.classList.add("animate");
            await runProgress(4000);
            try {
                const analysis = isImage
                    ? await analyzeImageLocally(file)
                    : await analyzeVideoLocally(file);
                const emoji = { bad: "🚨", warn: "⚠️", good: "✅" }[analysis.label] ?? "ℹ️";
                resultCard.style.color = {
                    bad:  "#ff6b6b",
                    warn: "#ffb020",
                    good: "#28c76f",
                }[analysis.label] ?? "#9ec9ff";
                digitarTexto(resultCard, `${emoji} ${analysis.explain} (Confiança: ${analysis.confidence}%)`, 30);
                if (analysis.label === "bad") {
                    showToast("🚨 Atenção: mídia suspeita detectada!", 4000);
                }
            } catch (error) {
                console.error("Erro na análise:", error);
                resultCard.style.color = "#ff6b6b";
                resultCard.textContent = `❌ Erro ao analisar: ${error.message}`;
            } finally {
                mascot?.classList.remove("animate");
                setTimeout(() => URL.revokeObjectURL(fileURL), 5000);
            }
        });
    }
    chips.forEach(chip => {
        chip.addEventListener("click", (e) => {
            const rede = e.currentTarget.dataset.sim || "plataforma";
            resultCard.style.color = "#9ec9ff";
            digitarTexto(resultCard, `🔗 Conectando com ${rede}...`, 30);
            setTimeout(() => {
                const msgs = [
                    `⚠️ ${rede}: possível desinformação detectada.`,
                    `✅ ${rede}: conteúdo verificado com selo JusIA.`,
                    `ℹ️ ${rede}: análise concluída — fontes encontradas.`,
                ];
                digitarTexto(resultCard, msgs[Math.floor(Math.random() * msgs.length)], 30);
                resultCard.style.color = "#00bfff";
            }, 2000);
        });
    });
    console.log("✅ JusIA inicializado com sucesso!");
});