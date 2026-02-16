document.addEventListener("DOMContentLoaded", () => {

    const inputText = document.getElementById("inputText");
    const btnCheck = document.getElementById("btnCheck");
    const btnRead = document.getElementById("btnRead");
    const btnClear = document.getElementById("btnClear");
    const progressWrap = document.getElementById("progressWrap");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const resultCard = document.getElementById("resultCard");
    const chips = document.querySelectorAll(".chip");
    const demoBtn = document.getElementById("demoIntegrations");
    const mascot = document.getElementById("mascot");
    const toast = document.getElementById("toast");
    const fileInput = document.getElementById("fileInput");
    const fileName = document.getElementById("fileName");

    if (!inputText || !btnCheck || !btnRead || !btnClear || !resultCard) {
        console.error("Elementos essenciais não encontrados. Verifique IDs no HTML.");
        showToast("Erro: elementos da página não foram encontrados.");
        return;
    }

    function showToast(msg, time = 2200) {
        if (!toast) {
            console.log("Toast:", msg);
            return;
        }
        toast.textContent = msg;
        toast.style.display = "block";
        setTimeout(() => (toast.style.display = "none"), time);
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
        if (!progressWrap || !progressBar || !progressText)
            return Promise.resolve();
        
        progressWrap.style.display = "block";
        progressBar.style.width = "0%";
        const steps = 60;
        let i = 0;
        const interval = duration / steps;
        
        return new Promise((resolve) => {
            const t = setInterval(() => {
                i++;
                const pct = Math.min(100, Math.round((i / steps) * 100));
                progressBar.style.width = pct + "%";
                progressText.textContent = `Analisando — ${pct}%`;
                
                if (i >= steps) {
                    clearInterval(t);
                    progressText.textContent = "Finalizando análise...";
                    setTimeout(() => {
                        progressWrap.style.display = "none";
                        progressBar.style.width = "0%";
                        resolve();
                    }, 300);
                }
            }, interval);
        });
    }

    async function analyzeImageLocally(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const img = new Image();
            
            reader.onload = (e) => {
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        
                        const analysis = analyzeImageData(ctx, canvas, file);
                        resolve(analysis);
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
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        
        let suspicionScore = 0;
        let warnings = [];

        const totalPixels = width * height;
        if (totalPixels < 50000) {
            suspicionScore += 15;
            warnings.push("Resolução muito baixa (típico de screenshots reprocessados)");
        }
        
        let colorVariance = 0;
        let prevR = pixels[0], prevG = pixels[1], prevB = pixels[2];
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            colorVariance += Math.abs(r - prevR) + Math.abs(g - prevG) + Math.abs(b - prevB);
            prevR = r; prevG = g; prevB = b;
        }
        const avgVariance = colorVariance / (pixels.length / 4);
        if (avgVariance < 5) {
            suspicionScore += 20;
            warnings.push("Cores muito uniformes (possível edição digital)");
        }
        
        const edges = detectEdges(ctx, width, height);
        if (edges > 0.3) {
            suspicionScore += 15;
            warnings.push("Bordas artificiais detectadas");
        }
        
        const fileNameLower = file.name.toLowerCase();
        const suspiciousNames = ['fake', 'editado', 'photoshop', 'manipulado', 'montagem', 'falso'];
        if (suspiciousNames.some(word => fileNameLower.includes(word))) {
            suspicionScore += 25;
            warnings.push("Nome do arquivo indica possível manipulação");
        }
        
        const fileSize = file.size;
        const expectedSize = totalPixels * 3; 
        const compressionRatio = fileSize / expectedSize;
        if (compressionRatio < 0.05) {
            suspicionScore += 10;
            warnings.push("Compressão excessiva detectada");
        }
        
        if (!file.lastModified || file.lastModified > Date.now()) {
            suspicionScore += 10;
            warnings.push("Metadados de data inconsistentes");
        }
        
        let label, confidence, explain;
        if (suspicionScore >= 50) {
            label = "bad";
            confidence = Math.min(95, 60 + suspicionScore / 2);
            explain = `🚨 Conteúdo altamente suspeito! ${warnings.join('. ')}.`;
        } else if (suspicionScore >= 25) {
            label = "warn";
            confidence = 50 + suspicionScore;
            explain = `⚠️ Conteúdo duvidoso. ${warnings.length > 0 ? warnings.join('. ') : 'Recomendamos verificar a fonte'}.`;
        } else {
            label = "good";
            confidence = Math.max(70, 100 - suspicionScore * 2);
            explain = "✅ Imagem parece autêntica. Nenhum sinal claro de manipulação detectado.";
        }
        
        return { label, confidence: confidence.toFixed(0), explain };
    }

    function detectEdges(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        let edgeCount = 0;
        let totalChecked = 0;
        const step = 10;
        
        for (let y = step; y < height - step; y += step) {
            for (let x = step; x < width - step; x += step) {
                const i = (y * width + x) * 4;
                const iRight = (y * width + (x + step)) * 4;
                const iDown = ((y + step) * width + x) * 4;
                
                const diffRight = Math.abs(pixels[i] - pixels[iRight]);
                const diffDown = Math.abs(pixels[i] - pixels[iDown]);
                
                if (diffRight > 100 || diffDown > 100) edgeCount++;
                totalChecked++;
            }
        }
        return edgeCount / totalChecked;
    }

    async function analyzeVideoLocally(file) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            
            video.onloadedmetadata = () => {
                let suspicionScore = 0;
                let warnings = [];
                const duration = video.duration;
                const width = video.videoWidth;
                const height = video.videoHeight;
                
                if (duration < 3) {
                    suspicionScore += 15;
                    warnings.push("Vídeo muito curto (comum em deepfakes)");
                }
                
                if (width < 640 || height < 480) {
                    suspicionScore += 15;
                    warnings.push("Resolução baixa (típico de conteúdo reprocessado)");
                }
                
                const fileNameLower = file.name.toLowerCase();
                const suspiciousNames = ['fake', 'editado', 'deepfake', 'manipulado', 'montagem', 'falso'];
                if (suspiciousNames.some(word => fileNameLower.includes(word))) {
                    suspicionScore += 30;
                    warnings.push("Nome do arquivo indica possível manipulação");
                }
                
                const fileSize = file.size;
                const expectedSize = duration * width * height * 0.1; 
                const ratio = fileSize / expectedSize;
                
                if (ratio < 0.3) {
                    suspicionScore += 20;
                    warnings.push("Compressão excessiva para a qualidade");
                }
                
                let label, confidence, explain;
                if (suspicionScore >= 50) {
                    label = "bad";
                    confidence = Math.min(95, 65 + suspicionScore / 2);
                    explain = `🚨 Vídeo altamente suspeito! ${warnings.join('. ')}.`;
                } else if (suspicionScore >= 25) {
                    label = "warn";
                    confidence = 55 + suspicionScore;
                    explain = `⚠️ Vídeo duvidoso. ${warnings.length > 0 ? warnings.join('. ') : 'Verifique a fonte original'}.`;
                } else {
                    label = "good";
                    confidence = Math.max(75, 100 - suspicionScore * 1.5);
                    explain = "✅ Vídeo parece autêntica. Nenhum sinal evidente de manipulação.";
                }
                
                resolve({ label, confidence: confidence.toFixed(0), explain });
                URL.revokeObjectURL(video.src);
            };
            
            video.onerror = () => {
                resolve({
                    label: "warn",
                    confidence: 0,
                    explain: "⚠️ Não foi possível analisar completamente o vídeo."
                });
            };
            video.src = URL.createObjectURL(file);
        });
    }

    const patterns = [
        { rx: /vacina(s)?\b.*autism(o|a)?/i, label: "bad", explain: "❌ Não há evidências científicas que relacionem vacinas ao autismo." },
        { rx: /urna(s)?\b.*fraud(e|a|ar)?/i, label: "warn", explain: "⚠️ Alegações de fraude em urnas exigem investigação por órgãos oficiais." },
        { rx: /\b(rem[eé]dio|milagroso|cura(-| )?tudo|cura(r)? o? (?:cancer|câncer|covid|doenças?))\b/i, label: "bad", explain: "🚫 Alegações de cura milagrosa sem base científica são falsas." },
        { rx: /\bterra\b.*\bplana\b/i, label: "bad", explain: "🌍 A Terra é esférica — comprovado por diversas evidências científicas." },
        { rx: /\b(ivermectin(a|e)?|cloroquina|hidroxicloroquina)\b/i, label: "warn", explain: "⚠️ Medicamentos controversos — verifique estudos científicos." },
    ];

    const claimVerbs = /\b(cura(r|ndo)?|resolve|cura(-| )?tudo|garante|comprovado|funciona sempre)\b/i;

    function hasNegationNearby(text, match) {
        const start = Math.max(0, match.index - 80);
        const snippet = text.slice(start, match.index + match.length + 40).toLowerCase();
        return /\b(n[oã]o|nega|sem evid[eê]ncia|não há|desment(e|ido)|falso|errado)\b/.test(snippet);
    }

    function analyzeText(text) {
        if (!text || !text.trim()) return null;

        for (const p of patterns) {
            const m = p.rx.exec(text);
            if (m) {
                if (hasNegationNearby(text, { index: m.index, length: m[0].length })) continue;
                return p;
            }
        }

        const claimMatch = claimVerbs.exec(text);
        if (claimMatch) {
            const diseaseRx = /\b(cancer|câncer|covid|hiv|diabet(e|es)|doenças? graves|tumor(es)?)\b/i;
            const diseaseMatch = diseaseRx.exec(text);
            if (diseaseMatch && !hasNegationNearby(text, { index: diseaseMatch.index, length: diseaseMatch[0].length })) {
                return {
                    rx: claimVerbs,
                    label: "bad",
                    explain: "🚫 Alegações de cura para doenças graves sem evidência científica são falsas.",
                };
            } else {
                return {
                    rx: claimVerbs,
                    label: "warn",
                    explain: '⚠️ Declaração forte detectada. Verifique fontes.',
                };
            }
        }
        return null;
    }

    async function performAnalysis(text) {
        if (mascot) mascot.classList.add("animate");
        digitarTexto(resultCard, "🔍 Iniciando análise de padrões...", 30);
        await runProgress(3000);
        if (mascot) mascot.classList.remove("animate");

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

        if (found.label === "bad") showToast("⚠️ Alerta: conteúdo possivelmente falso", 4400);
    }

    btnCheck.addEventListener("click", async () => {
        const text = inputText.value.trim();
        if (!text) {
            resultCard.textContent = "⚠️ Digite ou cole um texto para verificar.";
            resultCard.style.color = "#ffcc00";
            return;
        }
        resultCard.textContent = "";
        resultCard.style.color = "";
        await performAnalysis(text);
    });

    btnClear.addEventListener("click", () => {
        inputText.value = "";
        resultCard.textContent = "";
        if (fileName) fileName.innerHTML = "";
        if (fileInput) fileInput.value = "";
        if (progressWrap) progressWrap.style.display = "none";
    });

    btnRead.addEventListener("click", () => {
        const txt = inputText.value.trim();
        const speakText = txt || "Cole ou escreva um texto para que eu leia em voz alta.";
        if (!("speechSynthesis" in window)) {
            showToast("Seu navegador não suporta Speech Synthesis.");
            return;
        }
        const utt = new SpeechSynthesisUtterance(speakText);
        utt.lang = "pt-BR";
        utt.rate = 1;
        utt.onstart = () => mascot?.classList.add("animate");
        utt.onend = () => mascot?.classList.remove("animate");
        speechSynthesis.cancel();
        speechSynthesis.speak(utt);
    });

    if (fileInput) {
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files[0];
            if (!file) return;

            const isVideo = file.type.startsWith('video/');
            const isImage = file.type.startsWith('image/');

            if (!isImage && !isVideo) {
                resultCard.textContent = "⚠️ Por favor, envie apenas imagens ou vídeos.";
                resultCard.style.color = "#ffb020";
                return;
            }

            const fileURL = URL.createObjectURL(file);
            let previewHTML = '';
            
            if (isImage) {
                previewHTML = `<img src="${fileURL}" style="max-width: 300px; max-height: 300px; border-radius: 8px; margin: 10px auto; display: block;" alt="Preview">`;
            } else if (isVideo) {
                previewHTML = `<video src="${fileURL}" controls style="max-width: 400px; max-height: 300px; border-radius: 8px; margin: 10px auto; display: block;"></video>`;
            }
            
            fileName.innerHTML = previewHTML;
            resultCard.textContent = "🔍 Analisando conteúdo com IA local...";
            resultCard.style.color = "#9ec9ff";

            if (mascot) mascot.classList.add("animate");
            await runProgress(4000);

            try {
                let analysis = isImage ? await analyzeImageLocally(file) : await analyzeVideoLocally(file);
                const emoji = analysis.label === "bad" ? "🚨" : analysis.label === "warn" ? "⚠️" : "✅";
                
                resultCard.style.color = 
                    analysis.label === "bad" ? "#ff6b6b" :
                    analysis.label === "warn" ? "#ffb020" : "#28c76f";

                digitarTexto(resultCard, `${emoji} ${analysis.explain} (Confiança: ${analysis.confidence}%)`, 30);

                if (analysis.label === "bad") showToast("🚨 Atenção: mídia suspeita detectada!", 4000);

            } catch (error) {
                console.error("Erro na análise:", error);
                resultCard.style.color = "#ff6b6b";
                resultCard.textContent = `❌ Erro ao analisar: ${error.message}`;
            } finally {
                if (mascot) mascot.classList.remove("animate");
                setTimeout(() => URL.revokeObjectURL(fileURL), 5000);
            }
        });
    }

    function simulateIntegrationWith(button) {
        const rede = button.dataset.sim || "plataforma";
        resultCard.style.color = "#9ec9ff";
        digitarTexto(resultCard, `🔗 Conectando com ${rede}...`, 30);
        setTimeout(() => {
            const msgs = [
                `⚠️ ${rede}: possível desinformação detectada.`,
                `✅ ${rede}: conteúdo verificado com selo JusIA.`,
                `ℹ️ ${rede}: análise concluída — fontes encontradas.`,
            ];
            const msg = msgs[Math.floor(Math.random() * msgs.length)];
            digitarTexto(resultCard, msg, 30);
            resultCard.style.color = "#00bfff";
        }, 2000);
    }

    if (chips) {
        chips.forEach(ch => ch.addEventListener("click", e => simulateIntegrationWith(e.currentTarget)));
    }

    if (demoBtn) {
        demoBtn.addEventListener("click", () => {
            showToast("Integrações são simuladas. Em produção precisariam de APIs oficiais.");
        });
    }

    inputText.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.ctrlKey) btnCheck.click();
    });

    console.log("✅ JusIA inicializado com análise inteligente local de imagem e vídeo!");
});