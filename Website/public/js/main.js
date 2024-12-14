document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const booksContainer = document.getElementById('books-container');

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Предотвращаем перезагрузку страницы

        const searchQuery = searchInput.value.trim();
        const currentGenre = booksContainer.dataset.genre || null; // Получаем текущий жанр, если он есть

        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(searchQuery)}${currentGenre ? `&genre=${encodeURIComponent(currentGenre)}` : ''}`);
            if (response.ok) {
                const books = await response.json();

                // Очистка контейнера книг
                booksContainer.innerHTML = '';

                // Отображение найденных книг
                if (books.length > 0) {
                    books.forEach(book => {
                        booksContainer.innerHTML += `
                            <div class="book-card">
                                <img src="${book.image}" alt="${book.title}">
                                <h3>${book.title}</h3>
                                <p>${book.author}</p>
                            </div>
                        `;
                    });
                } else {
                    booksContainer.innerHTML = '<p>Книги не найдены</p>';
                }
            } else {
                console.error('Ошибка при запросе поиска');
            }
        } catch (err) {
            console.error('Ошибка:', err);
        }
    });
});
