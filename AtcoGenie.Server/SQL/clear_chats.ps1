$env:PGPASSWORD = 'postgres'
$env:PAGER = 'more'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d AtcoGenie_IMD -c "DELETE FROM \`"ChatMessages\`"; DELETE FROM \`"ChatSessions\`";"
