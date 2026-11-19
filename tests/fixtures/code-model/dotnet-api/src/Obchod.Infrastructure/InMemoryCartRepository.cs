using Obchod.Application;
using Obchod.Domain;

namespace Obchod.Infrastructure;

public sealed class InMemoryCartRepository : ICartRepository
{
    private readonly object _gate = new();
    private List<CartItem> _items =
    [
        new CartItem("1", "Tea", 2, 12900),
        new CartItem("2", "Cup", 1, 24900),
    ];

    public Task<Cart> GetAsync(CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            return Task.FromResult(new Cart(_items.ToList()));
        }
    }

    public Task<Cart> RemoveItemAsync(string itemId, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            _items = _items.Where(item => item.Id != itemId).ToList();
            return Task.FromResult(new Cart(_items.ToList()));
        }
    }

    public Task ClearAsync(CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            _items = [];
        }

        return Task.CompletedTask;
    }
}
