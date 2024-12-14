// Подключение модулей
const express = require('express');
const oracledb = require('oracledb');
const path = require('path');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = 3000;
// Разрешаем запросы с любого источника (или укажите свой источник)
app.use(cors());


// Настройка статического маршрута для папки Books и exmachina
app.use('/books', express.static(path.join(__dirname, '../Books')));
app.use(express.static(path.join(__dirname, 'exmachina')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Маршрут для главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'exmachina', 'index.html'));
});


// Подключение к Oracle Database
oracledb.initOracleClient({ libDir: 'D:\\Oracle\\instantclient_23_6' });
const dbConfig = {
    user: 'hr1',
    password: 'hr1',
    connectString: 'localhost/XEPDB1'
};

// Эндпоинт для авторизации
app.post('/login', async (req, res) => {
    const { login, password } = req.body; 
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        // Запрашиваем хэш пароля из базы
        const result = await connection.execute(
            `SELECT READER_PASSWORD_HASH 
             FROM READERS 
             WHERE READER_LOGIN = :login`,
            { login },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Проверяем, существует ли пользователь
        if (result.rows.length === 0) {
            return res.status(401).send({ message: "Неверный логин или пароль." });
        }

        // Получаем хэш из базы
        const user = result.rows[0];
        const hashFromDb = user.READER_PASSWORD_HASH;

        // Генерируем SHA-256 хэш введённого пароля
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex').toUpperCase();

        // Сравниваем хэш
        if (hashFromDb !== passwordHash) {
            return res.status(401).send({ message: "Неверный логин или пароль." });
        }

        // Логин успешен
        res.send({ success: true, message: "Логин успешен!" });
    } catch (err) {
        console.error("Ошибка на сервере:", err);
        res.status(500).send({ message: "Ошибка сервера." });
    } finally {
        if (connection) {
            await connection.close();
        }
    }
});


// Эндпоинт для регистрации
app.post('/register', async (req, res) => {
    const { name, login, password } = req.body;
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        // Генерация SHA-256 хэша пароля
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex').toUpperCase();

        const query = `INSERT INTO readers 
                       (PK_reader_id, reader_name, reader_login, reader_password_hash, reader_status, reader_registration_date) 
                       VALUES 
                       (readers_seq.NEXTVAL, :name, :login, :passwordHash, 'active', SYSDATE)`;

        await connection.execute(query, { name, login, passwordHash }, { autoCommit: true });
        res.json({ success: true, message: 'Регистрация прошла успешно' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    } finally {
        if (connection) {
            await connection.close();
        }
    }
});

// Эндпоинт для получения книг
app.get('/api/books', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);

        // Проверяем, есть ли параметр поиска
        const searchQuery = req.query.search ? `%${req.query.search}%` : null;

        // Запрос для получения 12 случайных книг с учётом параметра поиска
        const query = searchQuery
            ? `SELECT b.PK_BOOK_ID, UPPER(SUBSTR(b.BOOK_TITLE, 1, 1)) || LOWER(SUBSTR(b.BOOK_TITLE, 2)) AS BOOK_TITLE, 
                      a.AUTHOR_NAME, b.BOOK_IMAGE_PATH
               FROM books b
               LEFT JOIN authors a ON b.FK_AUTHOR_ID = a.PK_AUTHOR_ID
               WHERE b.BOOK_TITLE LIKE :search OR a.AUTHOR_NAME LIKE :search
               GROUP BY b.PK_BOOK_ID, b.BOOK_TITLE, a.AUTHOR_NAME, b.BOOK_IMAGE_PATH
               ORDER BY DBMS_RANDOM.VALUE
               FETCH FIRST 12 ROWS ONLY`
            : `SELECT b.PK_BOOK_ID, UPPER(SUBSTR(b.BOOK_TITLE, 1, 1)) || LOWER(SUBSTR(b.BOOK_TITLE, 2)) AS BOOK_TITLE, 
                      a.AUTHOR_NAME, b.BOOK_IMAGE_PATH
               FROM books b
               LEFT JOIN authors a ON b.FK_AUTHOR_ID = a.PK_AUTHOR_ID
               GROUP BY b.PK_BOOK_ID, b.BOOK_TITLE, a.AUTHOR_NAME, b.BOOK_IMAGE_PATH
               ORDER BY DBMS_RANDOM.VALUE
               FETCH FIRST 12 ROWS ONLY`;

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

// Эндпоинт для получения жанров
app.get('/api/genres', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);
        const query = `SELECT GENRE_NAME FROM genres ORDER BY GENRE_NAME`;
        const result = await connection.execute(query);
        res.json(result.rows.map(row => row[0]));
    } catch (err) {
        console.error(err);
        res.status(500).send('Ошибка сервера');
    } finally {
        if (connection) {
            await connection.close();
        }
    }
});

// Эндпоинт для получения книг по жанру
app.get('/api/genre/:genreName', async (req, res) => {
    const genreName = req.params.genreName;
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);

        const query = `
            SELECT b.PK_BOOK_ID, UPPER(SUBSTR(b.BOOK_TITLE, 1, 1)) || LOWER(SUBSTR(b.BOOK_TITLE, 2)) AS BOOK_TITLE,
                   a.AUTHOR_NAME, b.BOOK_IMAGE_PATH
            FROM books b
            LEFT JOIN books_genres bg ON b.PK_BOOK_ID = bg.FK_BOOK_ID
            LEFT JOIN genres g ON bg.FK_GENRE_ID = g.PK_GENRE_ID
            LEFT JOIN authors a ON b.FK_AUTHOR_ID = a.PK_AUTHOR_ID
            WHERE g.GENRE_NAME = :genre
            GROUP BY b.PK_BOOK_ID, b.BOOK_TITLE, a.AUTHOR_NAME, b.BOOK_IMAGE_PATH`;

        const result = await connection.execute(query, { genre: genreName });
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

// Маршрут для отображения страницы жанра
app.get('/genre/:genreName', (req, res) => {
    res.sendFile(path.join(__dirname, 'exmachina', 'genre.html'));
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});

// Маршрут для получения информации о книге по ID
app.get('/api/books/:id', async (req, res) => {
    const bookId = req.params.id;

app.get('/book/:id', (req, res) => {
    const bookId = req.params.id;
    // Логика получения информации о книге
    res.json({ message: `Информация о книге с ID ${bookId}` });
});

    try {
        // Устанавливаем соединение с базой данных
        const connection = await oracledb.getConnection(dbConfig);

        // SQL-запрос для получения информации о книге
        const result = await connection.execute(
            `
            SELECT 
                b.PK_BOOK_ID AS id,
                UPPER(SUBSTR(b.BOOK_TITLE, 1, 1)) || LOWER(SUBSTR(b.BOOK_TITLE, 2)) AS title,
                b.BOOK_DESCRIPTION AS description,
                b.BOOK_AVAILABLE_COPIES AS availableCopies,
                b.BOOK_TOTAL_COPIES AS totalCopies,
                b.BOOK_IMAGE_PATH AS imagePath,
                a.PK_AUTHOR_ID AS authorId,
                a.AUTHOR_NAME AS authorName
            FROM books b
            INNER JOIN authors a ON b.FK_AUTHOR_ID = a.PK_AUTHOR_ID
            WHERE b.PK_BOOK_ID = :bookId
            `,
            [bookId], // Параметры для SQL-запроса
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.status(404).send({ error: 'Книга не найдена' });
        }

        // Извлекаем первую запись (книга)
        const book = result.rows[0];

        // Получаем путь к цифровой версии книги (если доступна)
        const digitalBookResult = await connection.execute(
            `
            SELECT db.DIGITAL_BOOK_FILE_PATH AS filePath
            FROM digital_books db
            WHERE db.FK_BOOK_ID = :bookId
            `,
            [bookId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const digitalBook = digitalBookResult.rows.length > 0 ? digitalBookResult.rows[0] : null;

        // Получаем жанры книги
        const genresResult = await connection.execute(
            `
            SELECT g.GENRE_NAME AS name
            FROM genres g
            INNER JOIN books_genres bg ON g.PK_GENRE_ID = bg.FK_GENRE_ID
            WHERE bg.FK_BOOK_ID = :bookId
            `,
            [bookId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const genres = genresResult.rows.map(row => row.NAME);

        // Формируем полный объект ответа
        const bookData = {
            id: book.ID,
            title: book.TITLE,
            description: book.DESCRIPTION,
            availableCopies: book.AVAILABLECOPIES,
            totalCopies: book.TOTALCOPIES,
            imagePath: book.IMAGEPATH,
            author: {
                id: book.AUTHORID,
                name: book.AUTHORNAME
            },
            genres,
            digitalBook: digitalBook ? digitalBook.FILEPATH : null // Добавляем путь к файлу электронной книги
        };

        // Отправляем данные книги клиенту
        res.json(bookData);

        // Закрываем соединение
        await connection.close();
    } catch (err) {
        console.error('Ошибка при запросе данных о книге:', err);
        res.status(500).send({ error: 'Ошибка при запросе данных о книге' });
    }
});
app.get('/book/:id', (req, res) => {
    const bookId = req.params.id;
    // Логика для отображения книги по id
    res.render('book', { bookId: bookId });
});


// Маршрут для скачивания электронной книги
app.get('/api/download/:bookId', async (req, res) => {
    const bookId = req.params.bookId;

    try {
        // Устанавливаем соединение с базой данных
        const connection = await oracledb.getConnection(dbConfig);

        // Получаем путь к файлу из таблицы digital_books
        const result = await connection.execute(
            `
            SELECT db.DIGITAL_BOOK_FILE_PATH AS filePath
            FROM digital_books db
            WHERE db.FK_BOOK_ID = :bookId
            `,
            [bookId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.status(404).send({ error: 'Цифровая версия книги не найдена' });
        }

        const filePath = result.rows[0].FILEPATH;

        // Проверяем, существует ли файл по указанному пути
        if (fs.existsSync(filePath)) {
            // Отправляем файл на клиент
            res.download(filePath, (err) => {
                if (err) {
                    console.error('Ошибка при отправке файла:', err);
                    res.status(500).send({ error: 'Ошибка при скачивании файла' });
                }
            });
        } else {
            res.status(404).send({ error: 'Файл не найден на сервере' });
        }

        // Закрываем соединение
        await connection.close();
    } catch (err) {
        console.error('Ошибка при запросе данных о файле:', err);
        res.status(500).send({ error: 'Ошибка при запросе данных о файле' });
    }
});
app.get('/api/authors/:authorId', async (req, res) => {
    const authorId = req.params.authorId;

    try {
        // Запрос информации об авторе
        const authorQuery = `
            SELECT * 
            FROM authors 
            WHERE PK_AUTHOR_ID = :authorId
        `;
        const authorResult = await db.execute(authorQuery, [authorId]);

        if (authorResult.rows.length === 0) {
            return res.status(404).json({ error: 'Author not found' });
        }

        const author = authorResult.rows[0];

        // Запрос книг автора
        const booksQuery = `
            SELECT PK_BOOK_ID, TITLE, COVER_IMAGE 
            FROM books 
            WHERE AUTHOR_ID = :authorId
        `;
        const booksResult = await db.execute(booksQuery, [authorId]);

        // Формирование ответа
        res.json({
            id: author.PK_AUTHOR_ID,
            name: author.AUTHOR_NAME,
            description: author.AUTHOR_DESCRIPTION,
            books: booksResult.rows.map(book => ({
                id: book.PK_BOOK_ID,
                title: book.TITLE,
                cover: book.COVER_IMAGE
            }))
        });
    } catch (error) {
        console.error('Ошибка при получении данных автора:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/reservations', async (req, res) => {
    const { bookId, readerId, duration, employeeId } = req.body;

    try {
        // Проверяем, что обязательные параметры переданы
        if (!bookId || !readerId || !duration || !employeeId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Генерация нового ID бронирования
        const reservationIdResult = await db.execute('SELECT reservations_seq.NEXTVAL AS ID FROM dual');
        const reservationId = reservationIdResult.rows[0].ID;

        // Вычисляем дату возврата на основе продолжительности
        const insertQuery = `
            INSERT INTO reservations (
                PK_RESERVATION_ID,
                FK_BOOK_ID,
                FK_READER_ID,
                RESERVATION_ORDER_DATE,
                RESERVATION_RETURN_DATE,
                RESERVATION_DURATION,
                FK_EMPLOYEE_ID,
                RESERVATION_STATUS
            ) VALUES (
                :reservationId,
                :bookId,
                :readerId,
                SYSDATE,
                SYSDATE + :duration,
                :duration,
                :employeeId,
                'given'
            )
        `;

        await db.execute(insertQuery, {
            reservationId,
            bookId,
            readerId,
            duration,
            employeeId
        });

        // Подтверждаем транзакцию
        await db.commit();

        res.status(201).json({ message: 'Reservation created successfully', reservationId });
    } catch (error) {
        console.error('Ошибка оформления бронирования:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

