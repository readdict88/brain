# Bacaan dari Internet
```dataview
TABLE
medium AS Medium,
topics AS Topics,
shared AS "Email share?"
FROM #web AND -"2. SOURCE-LITERATURE NOTE"
SORT file.ctime DESC
LIMIT 5
```

```button
name New Item
type command
action QuickAdd: Add Item
```

# Bacaan Buku
```dataview
TABLE WITHOUT ID
("![cover|80](" + cover + ")") as Cover,
file.link AS Title,
author AS "Author",
year AS "Date read",
rating AS "Rating"
FROM #book AND -"003 Templates"
SORT date DESC
LIMIT 10
```

```button
name New Book
type command  
action QuickAdd: Add Book
```
# Kursus Online
```dataview
TABLE WITHOUT ID
file.link AS Title,
status AS Status,
topics AS Topics,
cost AS Cost
FROM #Courses AND -"003 Templates"
SORT file.ctime DESC
LIMIT 5
```

```button
name New Course
type command
action QuickAdd: Add Course
```

