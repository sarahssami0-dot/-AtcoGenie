using Microsoft.EntityFrameworkCore;
using AtcoGenie.Server.Domain.Entities;

namespace AtcoGenie.Server.Infrastructure.Data;

public class GenieDbContext : DbContext
{
    public GenieDbContext(DbContextOptions<GenieDbContext> options) : base(options) { }

    public DbSet<ChatSession> ChatSessions { get; set; }
    public DbSet<ChatMessage> ChatMessages { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ChatSession>()
            .HasKey(c => c.Id);

        modelBuilder.Entity<ChatMessage>()
            .HasKey(m => m.Id);

        modelBuilder.Entity<ChatMessage>()
            .HasOne(m => m.ChatSession)
            .WithMany(c => c.Messages)
            .HasForeignKey(m => m.ChatSessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
