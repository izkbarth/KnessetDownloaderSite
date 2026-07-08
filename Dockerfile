# משתמשים באימג' הרשמי של גוגל שכולל כבר את כרום מותקן מראש
FROM ghcr.io/puppeteer/puppeteer:21.5.0

# הגדרת תיקיית העבודה
WORKDIR /usr/src/app

# העתקת קבצי ההגדרות והתקנת הספריות
COPY package*.json ./
RUN npm install

# העתקת שאר קבצי הקוד של האתר
COPY . .

# חשיפת הפורט
EXPOSE 3000

# פקודת ההרצה
CMD [ "node", "server.js" ]