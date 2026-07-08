const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const JSZip = require('jszip');
const axios = require('axios');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/download', async (req, res) => {
    const targetUrl = req.query.url;
    console.log(`\n[שיוך בקשה] מתחיל לסרוק במצב אופטימיזציית דפדפן מלאה: ${targetUrl}`);
    
    if (!targetUrl) return res.status(400).send("Missing URL parameter");

    let browser;
    try {
        console.log("[+] מפעיל דפדפן וירטואלי מוסווה ברקע...");
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        console.log("[+] ניגש לאתר הכנסת וממתין לטעינת העמוד...");
        await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 45000 });

        console.log("[+] ממתין 4 שניות נוספות לרינדור סופי של הטבלאות...");
        await new Promise(resolve => setTimeout(resolve, 4000));

        console.log("[+] מחלץ ומנקה את הנתונים ישירות מתוך הדפדפן החי...");
        
        // כאן קורה הקסם: אנחנו מריצים קוד בתוך הדפדפן שיודע לקרוא את ה-DOM בדיוק כמו התוסף
        const linksToDownload = await page.evaluate((targetUrl) => {
            const validExtensions = ['.doc', '.docx', '.pdf'];
            const categories = [
                { text: "מסמכי הצעת החוק", folderName: "מסמכי הצעת החוק" },
                { text: "מסמכי החוק", folderName: "מסמכי החוק" },
                { text: "דיונים בכנסת", folderName: "דיונים בכנסת" },
                { text: "חומרי רקע", folderName: "חומרי רקע" }
            ];

            const extractedLinks = [];
            let protocolCounter = 1;
            let bgMaterialCounter = 1;

            const allLinks = document.querySelectorAll('a[href]');
            
            allLinks.forEach(link => {
                const href = link.href;
                const hrefLower = href.toLowerCase();
                const hasValidExt = validExtensions.some(ext => hrefLower.endsWith(ext) || hrefLower.includes(ext + '?'));
                if (!hasValidExt) return;

                let linkText = link.innerText ? link.innerText.trim() : "";
                if (linkText.includes("דפיברילטור בכנסת") || hrefLower.includes("defibrillator")) return;

                // זיהוי קטגוריה
                let targetFolder = "מסמכים כלליים";
                let currentElement = link;
                let foundCategory = null;

                for (let i = 0; i < 9; i++) {
                    if (!currentElement || currentElement === document.body) break;
                    const textContent = currentElement.innerText || "";
                    const matchCat = categories.find(cat => textContent.includes(cat.text));
                    if (matchCat) {
                        foundCategory = matchCat;
                        break;
                    }
                    currentElement = currentElement.parentElement;
                }

                if (foundCategory) {
                    targetFolder = foundCategory.folderName;
                }

                const row = link.closest('tr') || link.closest('.row') || link.closest('li') || link.parentElement;
                // שימוש ב-innerText של הדפדפן שמביא רק את הטקסט הגלוי לעין ומסנן קוד נסתר!
                let rowText = row ? (row.innerText || "") : linkText;

                let cleanInfo = rowText
                    .replace(/הורד|פרוטוקול|צפייה|פתיחת קובץ|קובץ|לצפייה/gi, '')
                    .replace(/בשידור|שידור לא קיים/gi, '')
                    .replace(/דיונים בכנסת|דיוני הכנסת/gi, '')
                    .replace(/\n/g, ' - ')
                    .replace(/\s*-\s*-\s*/g, ' - ')
                    .replace(/-\s*-/g, ' - ')
                    .trim();
                
                if (cleanInfo.startsWith('-')) cleanInfo = cleanInfo.substring(1).trim();
                if (cleanInfo.endsWith('-')) cleanInfo = cleanInfo.substring(0, cleanInfo.length - 1).trim();

                let finalName = "";

                if (targetFolder === "דיונים בכנסת" || hrefLower.includes('protocol') || linkText.includes('פרוטוקול')) {
                    targetFolder = "דיונים בכנסת"; 
                    finalName = `פרוטוקול מספר ${protocolCounter}`;
                    if (cleanInfo) finalName += ` - ${cleanInfo}`;
                    protocolCounter++;
                } else if (targetFolder === "חומרי רקע") {
                    let currentBgDate = "";
                    if (row) {
                        const dateEl = row.querySelector('[class*="doc-date"]') || 
                                       row.closest('.ng-star-inserted')?.querySelector('[class*="doc-date"]');
                        if (dateEl && dateEl.innerText.trim()) {
                            currentBgDate = dateEl.innerText.trim().replace(/[\/.]/g, '.');
                        }
                    }
                    let cleanLinkText = linkText.replace(/הורד|צפייה|פתיחת קובץ|קובץ/gi, '').trim();
                    finalName = `חומר רקע מספר ${bgMaterialCounter} - ${cleanLinkText}`;
                    if (currentBgDate) finalName += ` - מיום ${currentBgDate}`;
                    bgMaterialCounter++;
                } else {
                    finalName = linkText || cleanInfo;
                }

                if (!finalName || finalName.length < 5) {
                    finalName = href.substring(href.lastIndexOf('/') + 1).split('?')[0];
                }

                finalName = finalName.replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
                if (finalName.length > 120) finalName = finalName.substring(0, 115);

                const currentExt = validExtensions.find(ext => hrefLower.includes(ext)) || '.pdf';
                if (!finalName.toLowerCase().endsWith(currentExt)) {
                    finalName += currentExt;
                }

                extractedLinks.push({ url: href, folder: targetFolder, filename: finalName });
            });

            return extractedLinks;
        }, targetUrl);

        // חילוץ שם החוק מהעמוד לפני שסוגרים את הדפדפן
        let lawName = "מסמכי_כנסת";
        const retrievedLawName = await page.evaluate(() => {
            const headerElement = document.querySelector('.header-title');
            if (headerElement && headerElement.innerText.trim()) return headerElement.innerText.trim();
            const h1Element = document.querySelector('h1');
            if (h1Element) return h1Element.innerText.trim();
            return null;
        });
        if (retrievedLawName) lawName = retrievedLawName;

        await browser.close(); 
        console.log(`[+] סריקת הדפדפן הסתיימה. נמצאו ${linksToDownload.length} קבצים להורדה.`);

        if (linksToDownload.length === 0) {
            return res.status(404).send("No files found on this page");
        }

        // שלב ההורדה של הקבצים לתוך ה-ZIP (נשאר בשרת)
        const zip = new JSZip();
        let filesFoundCount = 0;
        
        for (const item of linksToDownload) {
            try {
                console.log(`[->] מוריד קובץ: ${item.filename}`);
                const fileResponse = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 15000 });
                const buffer = Buffer.from(fileResponse.data, 'binary');
                
                // מניעת כפילויות שמות בתוך ה-ZIP
                let finalFilename = item.filename;
                let counter = 1;
                let baseName = finalFilename.substring(0, finalFilename.lastIndexOf('.'));
                const ext = finalFilename.substring(finalFilename.lastIndexOf('.'));
                
                while (zip.file(`${item.folder}/${finalFilename}`)) {
                    finalFilename = `${baseName}_(${counter})${ext}`;
                    counter++;
                }

                zip.file(`${item.folder}/${finalFilename}`, buffer);
                filesFoundCount++;
            } catch (err) {
                console.log(`[!] נכשלה הורדת הקובץ: ${item.filename} (${err.message})`);
            }
        }

        if (filesFoundCount === 0) return res.status(404).send("Could not download files");

        console.log("[+] מייצר קובץ ZIP סופי...");
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        
        const safeZipName = encodeURIComponent(lawName.replace(/[\/\\:*?"<>|]/g, "_") + ".zip");
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${safeZipName}"`);
        res.send(zipBuffer);
        console.log("[V] ה-ZIP נשלח בהצלחה למשתמש!");

    } catch (error) {
        console.log("\n[❌ שגיאה קריטית קריסה ❌]");
        console.error(error.message);
        if (browser) await browser.close();
        res.status(500).send("Error processing request");
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));