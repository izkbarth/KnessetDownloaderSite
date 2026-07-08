const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const JSZip = require('jszip');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// הגשת עמוד הבית
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// נתיב הסריקה וההורדה
app.get('/download', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing URL parameter");

    try {
        // 1. הורדת ה-HTML של עמוד הכנסת
        const { data: html } = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0' }
        });

        const $ = cheerio.load(html); // טעינת ה-HTML לסורק

        // 2. חילוץ שם החוק עבור ה-ZIP
        let lawName = "מסמכי_כנסת";
        const headerText = $('.header-title').text().trim() || $('h1').text().trim();
        if (headerText) lawName = headerText;

        const validExtensions = ['.doc', '.docx', '.pdf'];
        const categories = [
            { text: "מסמכי הצעת החוק", folderName: "מסמכי הצעת החוק" },
            { text: "מסמכי החוק", folderName: "מסמכי החוק" },
            { text: "דיונים בכנסת", folderName: "דיונים בכנסת" },
            { text: "חומרי רקע", folderName: "חומרי רקע" }
        ];

        const zip = new JSZip();
        let protocolCounter = 1;
        let bgMaterialCounter = 1;
        let currentBgDate = "";
        let filesFoundCount = 0;

        // מערך זמני לאיסוף הקישורים שנמצאו בסריקה
        const linksToDownload = [];

        // 3. סריקת כל הקישורים בעמוד (בדומה לתוסף)
        $('a[href]').each((i, el) => {
            const link = $(el);
            const href = link.attr('href');
            if (!href) return;

            const absoluteUrl = href.startsWith('http') ? href : new URL(href, targetUrl).href;
            const hrefLower = absoluteUrl.toLowerCase();
            
            const hasValidExt = validExtensions.some(ext => hrefLower.endsWith(ext) || hrefLower.includes(ext + '?'));
            if (!hasValidExt) return;

            let linkText = link.text().trim();
            if (linkText.includes("דפיברילטור בכנסת") || hrefLower.includes("defibrillator")) return;

            // זיהוי קטגוריה על ידי טיפוס למעלה באלמנטים (הדמיה של .closest בשרת)
            let targetFolder = "מסמכים כלליים";
            let parent = link.parent();
            for (let depth = 0; depth < 7; depth++) {
                if (!parent || parent.length === 0) break;
                const parentText = parent.text() || "";
                const matchCat = categories.find(cat => parentText.includes(cat.text));
                if (matchCat) {
                    targetFolder = matchCat.folderName;
                    break;
                }
                parent = parent.parent();
            }

            const row = link.closest('tr').length ? link.closest('tr') : link.parent();
            let rowText = row.text().trim();

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
                finalName = `פרוטוקול מספר ${protocolCounter} - ${cleanInfo}`;
                protocolCounter++;
            } else if (targetFolder === "חומרי רקע") {
                const dateEl = row.find('[class*="doc-date"]').length ? row.find('[class*="doc-date"]') : row.closest('.ng-star-inserted').find('[class*="doc-date"]');
                if (dateEl.length && dateEl.text().trim()) {
                    currentBgDate = dateEl.text().trim().replace(/[\/.]/g, '.');
                }
                let cleanLinkText = linkText.replace(/הורד|צפייה|פתיחת קובץ|קובץ/gi, '').trim();
                finalName = `חומר רקע מספר ${bgMaterialCounter} - ${cleanLinkText}`;
                if (currentBgDate) finalName += ` - מיום ${currentBgDate}`;
                bgMaterialCounter++;
            } else {
                finalName = linkText || cleanInfo;
            }

            if (!finalName || finalName.length < 5) {
                finalName = absoluteUrl.substring(absoluteUrl.lastIndexOf('/') + 1).split('?')[0];
            }

            finalName = finalName.replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
            if (finalName.length > 120) finalName = finalName.substring(0, 115);

            const currentExt = validExtensions.find(ext => hrefLower.includes(ext)) || '.pdf';
            if (!finalName.toLowerCase().endsWith(currentExt)) finalName += currentExt;

            linksToDownload.push({ url: absoluteUrl, folder: targetFolder, filename: finalName });
        });

        // 4. הורדת הקבצים עצמם לתוך ה-ZIP בשרת
        for (const item of linksToDownload) {
            try {
                const fileResponse = await axios.get(item.url, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(fileResponse.data, 'binary');
                zip.file(`${item.folder}/${item.filename}`, buffer);
                filesFoundCount++;
            } catch (err) {
                console.error(`Failed to download file: ${item.url}`);
            }
        }

        if (filesFoundCount === 0) return res.status(404).send("No files found");

        // 5. יצירת ה-ZIP ושליחתו כקובץ להורדה בדפדפן
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        
        const safeZipName = encodeURIComponent(lawName.replace(/[\/\\:*?"<>|]/g, "_") + ".zip");
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${safeZipName}"`);
        res.send(zipBuffer);

    } catch (error) {
        console.error(error);
        res.status(500).send("Error processing request");
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));