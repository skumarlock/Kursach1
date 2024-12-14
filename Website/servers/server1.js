const express = require('express');
const oracledb = require('oracledb');
const app = express();
const port = 3000;

// Путь к статическим файлам
app.use(express.static('exmachina')); // Указываем папку exmachina для сервера

// Подключение к Oracle Database
oracledb.initOracleClient({ libDir: 'D:\\Oracle\\instantclient_23_6' }); // Укажите путь к Instant Client
const dbConfig = {
    user: 'hr1',
    password: 'hr1',
    connectString: 'localhost/XEPDB1'
};

// Эндпоинт для получения книг
app.get('/api/books', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);

        // Если есть параметр поиска
        const searchQuery = req.query.search ? `%${req.query.search}%` : null;

        // Запрос к базе данных
        const query = searchQuery
            ? `SELECT * FROM (SELECT PK_book_id, book_title, FK_author_id, image FROM books WHERE title LIKE :search OR author LIKE :search ORDER BY DBMS_RANDOM.VALUE) WHERE ROWNUM <= 10`
            : `SELECT * FROM (SELECT PK_book_id, book_title, FK_author_id, image FROM books ORDER BY DBMS_RANDOM.VALUE) WHERE ROWNUM <= 10`;

        const result = await connection.execute(query, searchQuery ? { search: searchQuery } : {});
        res.json(result.rows.map(row => ({
            id: row[0],
            title: row[1],
            author: row[2],
            image: row[3]
        })));
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    } finally {
        if (connection) {
            await connection.close();
        }
    }
});

(async function testConnection() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: 'hr1',
            password: 'hr1',
            connectString: 'localhost/XEPDB1'
        });
        console.log("Успешное подключение к базе данных!");
    } catch (err) {
        console.error("Ошибка подключения к базе данных:", err);
    } finally {
        if (connection) {
            await connection.close();
        }
    }
})();


// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});