<overview>
create an economy idle game in html and javascript following the rules of the game and style outlined below
</overview>

<game-rules>
- create a large square tile grid for the map.
- at the beginning of the game the player is given 4 randomly selected tiles in their hand (residential = 🏠, commercial = 🪙, manufacturing = 🏭, natural resource = 🌳)
- each tile should be its own object
- each commercial tile has the attributes (item stock = 0, max item stock = 10, sell_rate = 3)
- each manufacturing tile has the attributes (item_yield = 1, item_stock = 0)
- each natural resource tile has the attributes (resource_count = 200)
- when a manufacturing tile is near a natural resource tile it generates 1 item_stock every 3 seconds for each nearby natural resource tile
- when a manufacturing tile generates item_stock, each nearby natural resource tile loses 1 resource_count
- when a commercial tile is near a manufacturing tile it moves 1 item stock to its own stock every 3 seconds
- when a commercial tile is near a residential tile, it generates 1 $ for each residential tile its near "sell_rate" seconds
- when a player places a tile, their hand is given a new random tile ensuring they always have 4 tiles in their hand
- each tile costs $15 to place
- the player starts with $500 
</game-rules>

<ui-design>
- display the tile emojis on their card in the hand and on the grid
- when a commercial tile generates dollars, text for how many dollars were made slowly rises off the commercial tile and fades away  
- display the item stocks on each tile when they are on the tile grid
- include a yellow boarder around tiles in the players hand to indicate which one is selected
- use tailwind css to make the app stylish
- display the users current total cash amount
</ui-design>