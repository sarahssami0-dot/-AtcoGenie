$env:PGPASSWORD = 'postgres'
$env:PAGER = 'more'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d AtcoGenie_IMD -t -A -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'Chat%' ORDER BY table_name;"
