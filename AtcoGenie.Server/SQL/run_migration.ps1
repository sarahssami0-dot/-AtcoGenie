$env:PGPASSWORD = 'postgres'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d AtcoGenie_IMD -f "c:\Users\Sarah.Sami\.gemini\antigravity\playground\midnight-oort\AtcoGenie.Server\SQL\ChatHistory_Schema_Postgres.sql"
