using Obchod.Domain;

namespace Obchod.Application;

public interface ICartRepository
{
    Task<Cart> GetAsync(CancellationToken cancellationToken);

    Task<Cart> RemoveItemAsync(string itemId, CancellationToken cancellationToken);

    Task ClearAsync(CancellationToken cancellationToken);
}
