# משתמשים באימג' לינוקס רגיל ויציב של Node.js
FROM node:20-slim

# התקנת ספריות הבסיס בלבד שחיוניות להרצת דפדפנים בלינוקס (בלי השרתים של גוגל)
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbus-1-0 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# הגדרת תיקיית העבודה
WORKDIR /usr/src/app

# העתקת הגדרות והתקנת ספריות הפרויקט
COPY package*.json ./
RUN npm install

# פקודת הקסם: שימוש בכלי הרשמי של פאפטיר להתקנת כרום שמתאים בדיוק לגרסה שלנו
RUN npx puppeteer browsers install chrome

# הגדרת משתנה הסביבה כדי ש-server.js ידע בדיוק לאן כרום הותקן אוטומטית בענן
ENV PUPPETEER_EXECUTABLE_PATH=/home/node/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome

# העתקת שאר קבצי הקוד של האתר (index.html, server.js)
COPY . .

# חשיפת הפורט של השרת
EXPOSE 3000

# הרצת האתר
CMD [ "node", "server.js" ]