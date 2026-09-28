# Change request for the city bikes app

The app in this directory already implements the city bikes explorer. Everything it does today must keep working, with
and without JavaScript. Add:

1. **District filter:** a `<select>` with the accessible label `District` and the options `All districts` (first,
   selected by default) followed by every district name, sorted. Choosing a district narrows the visible stations to
   that district, together with the search: the list, the map markers, the total, the chart and table, and the globe dots
   all follow. Without JavaScript, `/?district=Neihu` (and `/?q=…&district=…`) renders the filtered page.
2. **Tour:** a button `Start tour`. While the tour runs, the selection moves to the next visible station (in list order)
   every 1.5 s, wrapping around; the button reads `Stop tour` and stops it. Changing the
   search or the district stops the tour.
