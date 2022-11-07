const PROJECTS = {
    'project-5': {
        'name': 'Watch-This-Now',
        'description': 'A web app that allows users to search for movies and TV shows and add them to their watchlist.',
        'tech': 'jQuery/SemanticUI',
        'image': 'assets/images/watch-this-now.gif',
        'url': 'https://danielfloresd.github.io/my-watch-this-now/',
        'github': 'https://github.com/danielfloresd/my-watch-this-now'
    },
    'project-4': {
        'name': 'OpenWeather Dashboard',
        'description': 'A web app that allows users to search for the weather in any city.',
        'tech': 'jQuery/Bootstrap',
        'image': 'assets/images/openweather-dashboard.png',
        'url': 'https://danielfloresd.github.io/openweather-dashboard/',
        'github': 'https://github.com/danielfloresd/openweather-dashboard'
    },
    'project-3': {
        'name': 'Bootcamp Coding Quiz',
        'description': 'A web app that allows users to take a timed quiz on JavaScript fundamentals.',
        'tech': 'HTML/CSS/JavaScript',
        'image': 'assets/images/bootcamp-coding-quiz.png',
        'url': 'https://danielfloresd.github.io/bootcamp-coding-quiz/',
        'github': 'https://github.com/danielfloresd/bootcamp-coding-quiz'
    },
    'project-2': {
        'name': 'Casa del Muelle San Carlos',
        'description': 'Rental property website for a vacation home in San Carlos, Sonora, Mexico.',
        'tech': 'HTML/CSS/JavaScript',
        'image': 'assets/images/casa-del-muelle-san-carlos.png',
        'url': 'https://www.casadelmuellesancarlos.com/',
        'github': 'https://github.com/danielfloresd/casa-del-muelle-san-carlos'
    },
    'project-1': {
        'name': 'Work Day Scheduler',
        'description': 'A web app that allows users to create a daily schedule.',
        'tech': 'jQuery/Bootstrap',
        'image': 'assets/images/work-day-scheduler.png',
        'url': 'https://danielfloresd.github.io/work-day-scheduler/',
        'github': 'https://github.com/danielfloresd/work-day-scheduler'
    },
    'project-0': {
        'name': 'Secure Password Generator',
        'description': 'A web app that allows users to generate a random password.',
        'tech': 'HTML/CSS/JavaScript',
        'image': 'assets/images/secure-password-generator.png',
        'url': 'https://danielfloresd.github.io/secure-password-generator/',
        'github': 'https://github.com/danielfloresd/secure-password-generator'
    },
}



function createProjectCards(){
    let projectCards =  $('#project-cards');
    for (let project in PROJECTS){
        let projectCard = $('<div>')
            .addClass('teal card')
            
        let projectCardLink = $('<a>')
            .addClass('ui')
            .attr('href', PROJECTS[project].url)
            .attr('target', '_blank')
          
        let projectCardImage = $('<div>')
            .addClass('card-img-top')
            .attr("style", "background-image: url(" +  PROJECTS[project].image + "); background-size: cover;background-position: center")
  
        let projectCardBody = $('<div>')
            .addClass('content');
        let projectCardTitle = $('<h3>')
            .addClass('header')
        
            .text(PROJECTS[project].name);
        let projectCardText = $('<p>')
            .addClass('description')
            .text(PROJECTS[project].description);
        let projectExtraContent = $('<div>')
            .addClass('ui extra-content');

        let projectCardGithub = $('<a>')
            .attr('href', PROJECTS[project].github)
            .attr('target', '_blank')
         
        let projectCardGithubIcon = $('<img>')
            .attr("src", `https://img.shields.io/badge/${PROJECTS[project].tech}-black.svg?logo=github&style=plastic`)

        projectCardGithub.append(projectCardGithubIcon);
        projectCardLink.append(projectCardImage.prepend(projectCardTitle));
        projectCardBody.append(projectCardText,projectCardGithub);
        projectCard.append(projectCardLink,projectCardBody );
        projectCards.append(projectCard);
    }
}


// Document Ready
$(document).ready(function(){
    createProjectCards();
});