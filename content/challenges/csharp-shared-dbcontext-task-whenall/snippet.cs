using Microsoft.EntityFrameworkCore;

namespace Acme.Portal.Services.Dashboard;

public sealed record InvoiceItem(Guid Id, Guid CustomerId, decimal Amount, DateTimeOffset IssuedAt);
public sealed record AuditEvent(Guid Id, Guid CustomerId, string Action, DateTimeOffset OccurredAt);
public sealed record CustomerDashboardDto(
    Guid CustomerId,
    IReadOnlyList<InvoiceItem> RecentInvoices,
    IReadOnlyList<AuditEvent> RecentEvents);

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<InvoiceItem> Invoices => Set<InvoiceItem>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
}

public sealed class CustomerDashboardService(AppDbContext dbContext)
{
    public async Task<CustomerDashboardDto> GetDashboardAsync(
        Guid customerId,
        CancellationToken cancellationToken = default)
    {
        Task<List<InvoiceItem>> invoicesTask = LoadRecentInvoicesAsync(customerId, cancellationToken);
        Task<List<AuditEvent>> eventsTask = LoadRecentAuditEventsAsync(customerId, cancellationToken);

        await Task.WhenAll(invoicesTask, eventsTask);

        return new CustomerDashboardDto(
            customerId,
            await invoicesTask,
            await eventsTask);
    }

    private Task<List<InvoiceItem>> LoadRecentInvoicesAsync(Guid customerId, CancellationToken ct) =>
        dbContext.Invoices
            .AsNoTracking()
            .Where(i => i.CustomerId == customerId)
            .OrderByDescending(i => i.IssuedAt)
            .Take(10)
            .ToListAsync(ct);

    private Task<List<AuditEvent>> LoadRecentAuditEventsAsync(Guid customerId, CancellationToken ct) =>
        dbContext.AuditEvents
            .AsNoTracking()
            .Where(e => e.CustomerId == customerId)
            .OrderByDescending(e => e.OccurredAt)
            .Take(20)
            .ToListAsync(ct);
}
