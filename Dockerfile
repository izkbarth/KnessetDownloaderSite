# משתמשים באימג' לינוקס רגיל ויציב של Node.js
FROM node:20-slim

# התקנת כל חבילות המערכת וכרום שדרושות לפאפטיר כדי לרוץ על לינוקס (רלוונטי ל-Render)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/pta/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# הגדרת משתנה סביבה כדי שפאפטיר לא ינסה להוריד כרום נוסף משל עצמו
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# הגדרת תיקיית העבודה
WORKDIR /usr/src/app

# העתקת הגדרות והתקנת ספריות
COPY package*.json ./
RUN npm install

# העתקת שאר הקבצים
COPY . .

# חשיפת הפורט
EXPOSE 3000

# הרצת האתר
CMD [ "node", "server.js" ]